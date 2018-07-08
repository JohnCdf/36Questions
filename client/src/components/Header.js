import React, {Component} from 'react';
import {connect} from 'react-redux';

class Header extends Component {
  render(){
    return(
      <div className="header-main">
        <a className="title" href="/"><span id="number">36</span><span id="text">QUESTIONS</span></a>
        {
          this.props.user !== 'pending' ? this.props.user ? <a href='account'>Account</a> : null : null
        }
      </div>
    );
  }
};

const mapStateToProps = state => ({
  user: state.user
});

export default connect(mapStateToProps)(Header);