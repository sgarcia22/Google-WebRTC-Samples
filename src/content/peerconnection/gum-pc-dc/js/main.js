/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

var startButton = document.getElementById('startButton');
var callButton = document.getElementById('callButton');
var hangupButton = document.getElementById('hangupButton');

callButton.disabled = true;
hangupButton.disabled = true;
startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;

// Data channel
var sendChannel;
var receiveChannel;
var dataConstraint;
var sendButton         = document.querySelector('button#sendButton');
var dataChannelSend    = document.querySelector('textarea#dataChannelSend');
var dataChannelReceive = document.querySelector('textarea#dataChannelReceive');
sendButton.onclick = sendData;

var startTime;
var localVideo = document.getElementById('localVideo');
var remoteVideo = document.getElementById('remoteVideo');

localVideo.addEventListener('loadedmetadata', function() {
  trace('Local video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.addEventListener('loadedmetadata', function() {
  trace('Remote video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.onresize = function() {
  trace('Remote video size changed to ' +
    remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
  // We'll use the first onsize callback as an indication that video has started
  // playing out.
  if (startTime) {
    var elapsedTime = window.performance.now() - startTime;
    trace('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
    startTime = null;
  }
};

var localStream;
var remoteStream;
var pc1;
var pc2;
var offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

function gotStream(stream) {
  trace('Received local stream');
  localVideo = attachMediaStream(localVideo, stream);
  localStream = stream;
  callButton.disabled = false;

  AdapterJS.utils.addEvent(localStream.getVideoTracks()[0], 'muted', console.log);
  AdapterJS.utils.addEvent(localStream.getVideoTracks()[0], 'unmuted', console.log);
  AdapterJS.utils.addEvent(localStream.getVideoTracks()[0], 'ended', console.log);
}

function gumFailed(e) {
  alert('getUserMedia() error: ' + e.name);
}

function start() {
  trace('Requesting local stream');
  startButton.disabled = true;
  var constraints = {
    audio: true,
    video: true
    // video: {mediaSource: 'screensharing'}
  };
  // var constraints = window.constraints = {
  //   audio: true,
  //   video: {
  //     mediaSource: 'screen'
  //   }
  // };

  // if (typeof Promise === 'undefined') {
  //   navigator.getUserMedia(constraints, gotStream, gumFailed);
  // } else {
    navigator.mediaDevices.getUserMedia(constraints)
    .then(gotStream)
    .catch(gumFailed);
  // }
}

function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  trace('Starting call');
  startTime = window.performance.now();
  var videoTracks = localStream.getVideoTracks();
  var audioTracks = localStream.getAudioTracks();
  if (videoTracks.length > 0) {
    trace('Using video device: ' + videoTracks[0].label);
  }
  if (audioTracks.length > 0) {
    trace('Using audio device: ' + audioTracks[0].label);
  }
  var servers = null;
  pc1 = new RTCPeerConnection(servers);
  trace('Created local peer connection object pc1');
  pc1.onicecandidate = function(e) {
    onIceCandidate(pc1, e);
  };
  pc2 = new RTCPeerConnection(servers);
  trace('Created remote peer connection object pc2');
  pc2.onicecandidate = function(e) {
    onIceCandidate(pc2, e);
  };
  pc1.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc1, e);
  };
  pc2.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc2, e);
  };
  pc2.onaddstream = gotRemoteStream;
  // pc2.ontrack = function(a, b, c) { debugger;};

  // pc1.addStream(localStream);
  localStream.getTracks().forEach(function(track) { pc1.addTrack(track, localStream) } );
  trace('Added local stream to pc1');

  sendChannel = pc1.createDataChannel('sendDataChannel', dataConstraint);
  trace('Created send data channel');
  if (sendChannel.readyState === 'open') {
    onSendChannelStateChange();
  }
  sendChannel.onopen  = onSendChannelStateChange;
  sendChannel.onclose = onSendChannelStateChange;
  pc2.ondatachannel   = receiveChannelCallback;


  trace('pc1 createOffer start');
  pc1.createOffer(offerOptions).then(onCreateOfferSuccess).catch(onCreateSessionDescriptionError);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function onCreateOfferSuccess(desc) {
  trace('Offer from pc1\n' + desc.sdp);
  trace('pc1 setLocalDescription start');
  pc1.setLocalDescription(desc).then(function(){onSetLocalSuccess(pc1);})
                               .catch(onSetSessionDescriptionError);
  trace('pc2 setRemoteDescription start');
  pc2.setRemoteDescription(desc).then(function(){onSetRemoteSuccess(pc2);})
                               .catch(onSetSessionDescriptionError);
  trace('pc2 createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  // pc2.createAnswer().then(onCreateAnswerSuccess).catch(onCreateSessionDescriptionError);
}

function onSetLocalSuccess(pc) {
  trace(getName(pc) + ' setLocalDescription complete');
}

function onSetRemoteSuccess(pc) {
  trace(getName(pc) + ' setRemoteDescription complete');

  if (pc == pc2)
    pc2.createAnswer().then(onCreateAnswerSuccess).catch(onCreateSessionDescriptionError);
}

function onSetSessionDescriptionError(error) {
  trace('Failed to set session description: ' + error.toString());
}

function gotRemoteStream(e) {
  remoteStream = e.stream;
  remoteVideo = attachMediaStream(remoteVideo, remoteStream);

  AdapterJS.utils.addEvent(remoteStream.getVideoTracks()[0], 'muted', console.log);
  AdapterJS.utils.addEvent(remoteStream.getVideoTracks()[0], 'unmuted', console.log);
  AdapterJS.utils.addEvent(remoteStream.getVideoTracks()[0], 'ended', console.log);

  trace('pc2 received remote stream');
}

function onCreateAnswerSuccess(desc) {
  trace('Answer from pc2:\n' + desc.sdp);
  trace('pc2 setLocalDescription start');
  pc2.setLocalDescription(desc).then(function(){onSetLocalSuccess(pc2);})
                               .catch(onSetSessionDescriptionError);
  trace('pc1 setRemoteDescription start');
  pc1.setRemoteDescription(desc).then(function(){onSetRemoteSuccess(pc1);})
                                .catch(onSetSessionDescriptionError);
}

function onIceCandidate(pc, event) {
  if (event.candidate) {
    getOtherPc(pc).addIceCandidate(new RTCIceCandidate(event.candidate))
        .then(function(){onAddIceCandidateSuccess(pc);})
        .catch(function(err){onAddIceCandidateError(pc, err);});
    trace(getName(pc) + ' ICE candidate: \n' + event.candidate.candidate);
  }
}

function onAddIceCandidateSuccess(pc) {
  trace(getName(pc) + ' addIceCandidate success');
}

function onAddIceCandidateError(pc, error) {
  trace(getName(pc) + ' failed to add ICE Candidate: ' + error.toString());
}

function onIceStateChange(pc, event) {
  if (pc) {
    trace(getName(pc) + ' ICE state: ' + pc.iceConnectionState);
    console.log('ICE state change event: ', event);
  }
}

function sendData() {
  var data = dataChannelSend.value;
  sendChannel.send(data);
  trace('Sent Data: ' + data);
}

function receiveChannelCallback(event) {
  trace('Receive Channel Callback');
  receiveChannel = event.channel;
  if (receiveChannel.readyState === 'open') {
    onReceiveChannelStateChange();
  }
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onclose = onReceiveChannelStateChange;
}

function onSendChannelStateChange() {
  var readyState = sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
  if (readyState === 'open') {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function onReceiveChannelStateChange() {
  var readyState = receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
}

function onReceiveMessageCallback(event) {
  trace('Received Message');
  dataChannelReceive.value = event.data;
}

function hangup() {
  trace('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}