var PeerConnection = (window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
var getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
var localChannelOptions = {
    ordered: false,
    maxRetransmitTime: 3000,
};
var receiveChannel = null;
var localChannel = null;
var pc = null;
var createPcAndDataChannel = function() {
    pc = new PeerConnection();
    localChannel = pc.createDataChannel("localChannel", localChannelOptions);
    localChannel.onerror = datachannel_error;
    localChannel.onopen = datachannel_open;
    localChannel.onclose = datachannel_close;
    localChannel.onmessage = datachannel_message;
    pc.ondatachannel = pc_datachannel;
    pc.onaddstream = pc_addstream;
    pc.onicecandidate = pc_icecandidate
};
var datachannel_error = function(error) {
    console.log("数据传输通道建立异常:", error)
};
var datachannel_open = function() {
    console.log("本地数据通道建立成功")
};
var datachannel_close = function() {
    console.log("关闭数据传输通道")
};
var datachannel_message = function(event) {
    console.log(event.data)
};
var downloadFileData = {
    "maxsize": 0,
    "filename": null,
    "data": []
};
var pc_datachannel = function(event) {
    receiveChannel = event.channel;
    receiveChannel.onmessage = function(event) {
        var msg = null;
        try {
            msg = JSON.parse(event.data)
        } catch(e) {
            if (downloadFileData.filename != null) {
                downloadFileData.data.push(event.data);
                var doneSize = 0;
                for (var i = 0; i < downloadFileData.data.length; i++) {
                    doneSize += downloadFileData.data[i].byteLength
                }
                if (downloadFileData.maxsize <= doneSize) {
                    var fileBlob = new Blob(downloadFileData.data);
                    var anchor = document.createElement("a");
                    anchor.href = URL.createObjectURL(fileBlob);
                    anchor.download = downloadFileData.filename;
                    anchor.click();
                    downloadFileData = {
                        "maxsize": 0,
                        "filename": null,
                        "data": []
                    }
                }
            }
            return
        }
        if (msg.type == "text") {
            addYouMsg(msg.data, "left")
        } else {
            if (msg != null && msg.type == "file") {
                downloadFileData.maxsize = msg.data.fileSize;
                downloadFileData.filename = msg.data.fileName
            }
        }
    }
};
var pc_addstream = function(event) {
    document.getElementById("remote").src = URL.createObjectURL(event.stream)
};
var pc_icecandidate = function(event) {
    if (event.candidate !== null) {
        var param = {
            key: "SIGNALLING_OFFER",
            value: {
                "event": "_ice_candidate",
                "data": {
                    "candidate": event.candidate
                }
            }
        };
        socket.sendJson(param)
    }
};
var sendOfferFn = function(desc) {
    pc.setLocalDescription(desc);
    var param = {
        key: "SIGNALLING_OFFER",
        value: {
            "event": "_offer",
            "data": {
                "sdp": desc
            }
        }
    };
    socket.sendJson(param)
},
sendAnswerFn = function(desc) {
    pc.setLocalDescription(desc);
    var param = {
        key: "SIGNALLING_OFFER",
        value: {
            "event": "_answer",
            "data": {
                "sdp": desc
            }
        }
    };
    socket.sendJson(param)
};
var answer = function(value) {
    var json = JSON.parse(value);
    if (json.event === "_ice_candidate") {
        pc.addIceCandidate(new RTCIceCandidate(json.data.candidate))
    } else {
        pc.setRemoteDescription(new RTCSessionDescription(json.data.sdp),
        function() {
            if (json.event === "_offer") {
                pc.createAnswer(sendAnswerFn,
                function(error) {
                    console.log("回复信令answer失败:" + error)
                })
            }
        })
    }
};