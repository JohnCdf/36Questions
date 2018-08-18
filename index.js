const http = require('http');
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const config = require('./config');
const cors = require('cors');

mongoose.connect(config.DBurl, { useNewUrlParser: true });

app.use(cors());

app.use(express.json());

var server = http.createServer(app);
const io = require('socket.io')(server);

require('./services/routes/auth')(app);
require('./services/routes/users')(app);
require('./services/matching')(io);
require('./services/activeRoom')(io);

if (process.env.NODE_ENV === 'production') {
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/build/index.html');
  })
};

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log('Listening at port ', PORT))