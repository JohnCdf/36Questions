const node_uid = require('node-uid')
const questions = require('../data/questions');

function Message(text, socket) {
  if (!socket) return null

  let state = {
    _id: node_uid(),
    text,
    createdAt: new Date(),
    user: {
      _id: socket.userData._id,
      name: socket.userData.firstName
    }
  }

  return state
}

function Room(id, nsp, ACTIVE_ROOMS) {
  this.id = id
  this.nsp = nsp
  this.ACTIVE_ROOMS = ACTIVE_ROOMS
  this.users = {}
  this.currentQuestionIndex = -1
  this.currentTurn = 0
  this.isActive = false
  this.inactiveUser = null
  this.activeUser = null
}

Room.prototype.join = function(socket) {
  let { users } = this;
  if (Object.keys(users).length >= 2) return socket.emit('joined', { message: 'This room is full', res: false});
  
  socket.join(this.id, () => {
    this.users[socket.id] = socket;

    this.bindSocket(socket);
    this.handleConnect(socket);
    socket.on('disconnect', () => this.handleDisconnect(socket));
  })
}
Room.prototype.bindSocket = function(socket) {
  socket.on('message', text => { // Handle message event for each user  
    if (typeof text != 'string' || text.trim() === '') return 
    
    const message = Message(text, socket)

    this.emit_to_room('message', message)
  });
  socket.on('ready', () => {
    if (this.isActive)  { // game is already going
      socket.emit('display', 'Game has already started');
      return
    }
    // this user is ready to play
    let { id } = socket;
    socket.isReadyToPlay = true
    socket.emit('isReady')
    
    // when a user is ready to play, assign them to inactive if there an active user
    // else if the is no active user, they will be the active user
    if (this.activeUser) {
      this.inactiveUser = this.users[id]
    } else {
      this.activeUser = this.users[id]
      this.emit_to_room('display', socket.userData.firstName + ' is ready to play!');
    }

    if (!this.activeUser || !this.inactiveUser) return

    if (this.activeUser.isReadyToPlay && this.inactiveUser.isReadyToPlay) {
      this.activeUser.emit('isActive', true);
      this.inactiveUser.emit('isActive', false);
      this.isActive = true;
      this.nextQuestion(); // here is the first question!
    }
  });
  socket.on('done', () => { // the user is done answering question
    let { activeUser, inactiveUser } = this;

    if (!activeUser) {
      return socket.emit('display', 'Waiting for users.');
    }
    if (!inactiveUser) {
      return socket.emit('display', 'Waiting for users to be ready.');
    }
    if (!this.isActive) {
      socket.emit('display', 'Waiting for all users to be ready.')
      return socket.emit('isActive', isActiveUser)
    }

    let isActiveUser = activeUser.id === socket.id;

    socket.emit('isActive', isActiveUser);

    if (isActiveUser) { // if they were the active user
      this.toggleActiveUser(socket);
      // move onto the next question!
      this.nextQuestion()
    } else { // its not your turn
      socket.emit('isActive', false);
      socket.emit('display', 'Its not your turn yet!');
    }
  });
  socket.on('typing', (status) => {
    socket.broadcast.emit('typing', { name: socket.userData.firstName, status });
  });
}
Room.prototype.handleConnect = function(socket) {
  socket.emit('joined', { res: true })
  
  socket.emit('display', 'Joined room. Waiting for user..');
  
  if (Object.keys(this.users).length == 2) {
    if(this.currentQuestionIndex > -1) {
      if (this.activeUser) {
        this.activeUser.emit('isActive', true)
      }
      this.nextQuestion()
      return
    }
    
    let usersArray = Object.values(this.users)
    let U1 = usersArray[0];
    let U2 = usersArray[1];
    this.emit_to_room('display', 'Matching complete. Welcome! Take this time to get to know each other');
    U1.emit('message', Message(
      'You have been matched with ' + U2.userData.firstName + '. Say hello!',
      {
        userData: { _id: 1,
        firstName: '36 Questions' }
      }
    ));
    U2.emit('message', Message(
      'You have been matched with ' + U1.userData.firstName + '. Say hello!',
      {
        userData: { _id: 1,
        firstName: '36 Questions' }
      }
    ));
  }
}
Room.prototype.handleDisconnect = function(socket) {
  delete this.users[socket.id];
  this.isActive = false; // the game is not active (for the moment, until user length is back to 2)

  if (this.activeUser && this.activeUser.id === socket.id) {
    this.activeUser = null
  } else if (this.inactiveUser && this.inactiveUser.id === socket.id) {
    this.inactiveUser = null
  }

  if (Object.keys(this.users).length == 1) {
    this.nsp.in(this.id).emit('user disconnected', socket.userData.firstName)
  } else if (Object.keys(this.users).length == 0) {
    delete this.ACTIVE_ROOMS[this.id]
  }
}

Room.prototype.emit_to_room = function(type, payload) {
  this.nsp.in(this.id).emit(type, payload);
};

Room.prototype.toggleActiveUser = function(socket) {
  // toggle the active / inactive users
  this.activeUser = this.users[this.inactiveUser.id];
  this.activeUser.emit('isActive', true);
  this.inactiveUser = this.users[socket.id];
  this.inactiveUser.emit('isActive', false);
}
Room.prototype.nextQuestion = function() {
  if (!this.isActive) { // this game is not active!
    return
  }
  if (this.currentTurn == 0) {
    this.currentTurn = 1
    this.currentQuestionIndex++
  } else {
    this.currentTurn = 0
  }
  let { currentQuestionIndex } = this;

  let question = questions[currentQuestionIndex];
  
  if (question) {
    this.emit_to_room('question index', currentQuestionIndex + 1);
    let { activeUser, inactiveUser } = this;
    if (this.currentTurn == 1) {
      activeUser.emit('display', 'Your turn to answer. ' + question.body)
      inactiveUser.emit('display', `${activeUser.userData.firstName}'s turn to answer. "${question.body}"`)
    } else {
      activeUser.emit('display', 'Question: ' + question.body)
      inactiveUser.emit('display', `Question for ${activeUser.userData.firstName}. "${question.body}"`)
    }
  } else {
    this.ending()
  }
}

Room.prototype.ending = function() {
  this.isActive = false
  this.emit_to_room('end');
  this.emit_to_room('isActive', false);
  this.emit_to_room('display', 'You have both made it to the end');

  messages = [
    'Now comes the most difficult part',
    'If you would like to get to know each other then by all means do so',
    'You can continue to chat for as long as you wish.'
  ];

  let i = 0;
  let interval = setInterval(() => {
    let { users } = this;
    let m = messages[i]
    if (!m || Object.keys(users).length < 2) {
      this.emit_to_room('display', '');
      return clearInterval(interval)
    }
    this.emit_to_room('display', m)
    i++
  }, 4000);
}

module.exports = Room
