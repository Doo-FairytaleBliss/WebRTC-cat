$("#query-tabs li:eq(0) a").tab("show");
var socket_onmessage = function(event) {
    var message = JSON.parse(event.data);
    if (message.key == "PERSONAL_ID") {
        $("#identity").html(message.value)
    } else {
        if (message.key == "QUERY_ID") {
            var label = $("#queryShow label[name='show']");
            var value = message.value ? "可发起对话": "不可发起对话";
            var color = message.value ? "green": "red";
            label.css({
                "color": color
            });
            label.html(value);
            var ready = $("#queryShow button[name='ready']");
            if (message.value) {
                ready.show()
            } else {
                ready.hide()
            }
            $("#queryShow").modal("show")
        } else {
            if (message.key == "READY_FOR_ONE") {
                $("#answerShow label[name='show']").html("接收到［" + message.value + "］发来的对话请求");
                $("#dialogForOne label[name='name']").html(message.value);
                $("#answerShow").modal("show")
            } else {
                if (message.key == "READY_FOR_ONE_RESPONSE") {
                    var value = JSON.parse(message.value);
                    $("#queryShow").modal("hide");
                    if (value.status) {
                        $("#dialogForOne label[name='name']").html(value.answerId);
                        $("#dialogForOne").modal("show");
                        createPcAndDataChannel();
                        pc.createOffer(sendOfferFn,
                        function(error) {
                            console.log("发送信令offer失败:" + error)
                        })
                    } else {
                        $("#dialogForOne").modal("hide");
                        alert(value.msg)
                    }
                    $("#queryShow button[name='ready']").html("对话准备");
                    $("#queryShow button[name='ready']").data("ready", false);
                    $("#queryShow button[name='ready']").toggleClass("active")
                } else {
                    if (message.key == "SIGNALLING_ANSWER") {
                        answer(message.value)
                    } else {
                        if (message.key == "ONE_CHANNEL_CLOSE") {
                            if (message.value) {
                                closeChannel();
                                $("#dialogForOne ul[name='bubbleDiv']").html("");
                                $("#dialogForOne").modal("hide")
                            }
                        }
                    }
                }
            }
        }
    }
};
$("#findPersonalId").on("click",
function() {
    var id = $("#personalId").val();
    if (id.length != 0) {
        var param = {
            key: "QUERY_ID",
            value: id
        };
        socket.sendJson(param)
    }
});
$("#queryShow button[name='ready']").on("click",
function() {
    var id = $("#personalId").val();
    if (id.length != 0) {
        var param = {
            key: "READY_FOR_ONE",
            value: id
        };
        socket.sendJson(param);
        $(this).toggleClass("active");
        if ($(this).data("ready")) {
            $("#queryShow button[name='close']").show();
            $(this).html("对话准备");
            $(this).data("ready", false)
        } else {
            $(this).html("取消准备");
            $(this).data("ready", true);
            $("#queryShow button[name='close']").hide()
        }
    }
});
$("#answerShow button[name='ready']").on("click",
function() {
    var param = {
        key: "READY_FOR_ONE_RESPONSE",
        value: true
    };
    socket.sendJson(param);
    $("#answerShow").modal("hide");
    $("#dialogForOne").modal("show");
    createPcAndDataChannel()
});
$("#answerShow button[name='close']").on("click",
function() {
    var param = {
        key: "READY_FOR_ONE_RESPONSE",
        value: false
    };
    socket.sendJson(param);
    $("#answerShow").modal("hide")
});
$("#dialogForOne button[name='close']").on("click",
function() {
    closeChannel();
    var param = {
        key: "ONE_CHANNEL_CLOSE",
        value: true
    };
    socket.sendJson(param);
    $("#dialogForOne ul[name='bubbleDiv']").html("");
    $("#dialogForOne").modal("hide")
});
var closeChannel = function() {
    receiveChannel.close();
    localChannel.close();
    pc.close();
    receiveChannel = null;
    localChannel = null;
    pc = null;
    if (stream != null) {
        stream.getVideoTracks()[0].stop();
        stream.getAudioTracks()[0].stop();
        stream = null
    }
};
var sendMsg = function() {
    var param = {
        "type": "text",
        "data": $("#message").val()
    };
    localChannel.send(JSON.stringify(param));
    addYouMsg(param.data, "right");
    $("#message").val("")
};
var addYouMsg = function(message, is_i) {
    var li = $('<li class="bubbleItem clearfix">');
    var img = $('<img src="https://img.qq1234.org/uploads/allimg/141110/3_141110174904_1.jpg" height="35px;" style="float: ' + is_i + ';">');
    var span = $('<span class="bubble ' + is_i + 'Bubble">');
    var you_msg = $("<span>");
    you_msg.html(message);
    span.append(you_msg);
    var bottomLevel = $('<span class="bottomLevel">');
    span.append(bottomLevel);
    var bottomLevel = $('<span class="topLevel">');
    span.append(bottomLevel);
    li.append(img);
    li.append(span);
    $(".bubbleDiv").append(li)
};
var stream = null;
var openVideoAudio = function(is_video, is_audio) {
    getUserMedia.call(navigator, {
        video: is_video,
        audio: is_audio
    },
    function(localMediaStream) {
        stream = localMediaStream;
        var video = document.getElementById("video");
        video.src = window.URL.createObjectURL(localMediaStream);
        pc.addStream(stream);
        pc.createOffer(sendOfferFn,
        function(error) {
            console.log("发送信令offer失败:" + error)
        })
    },
    function(error) {
        console.log("创建媒体对象失败:" + error)
    })
};
$("#openVideo").on("click",
function() {
    $(this).toggleClass("active");
    $(this).data("use", $(this).data("use") ? false: true);
    if ($(this).data("use")) {
        openVideoAudio(true, true);
        $(this).find(" > span").html("结束视频");
        $("#openAudio").hide()
    } else {
        stream.getVideoTracks()[0].stop();
        stream.getAudioTracks()[0].stop();
        pc.removeStream(stream);
        stream = null;
        $(this).find(" > span").html("开始视频");
        $("#openAudio").show()
    }
});
$("#openAudio").on("click",
function() {
    $(this).toggleClass("active");
    $(this).data("use", $(this).data("use") ? false: true);
    if ($(this).data("use")) {
        openVideoAudio(false, true);
        $(this).find(" > span").html("结束语音");
        $("#openVideo").hide()
    } else {
        stream.getAudioTracks()[0].stop();
        pc.removeStream(stream);
        stream = null;
        $(this).find(" > span").html("开始语音");
        $("#openVideo").show()
    }
});
$("#fileMsg").on("change",
function() {
    var fileData = this.files[0];
    var fileSize = fileData.size;
    var fileName = fileData.name;
    var sendMaxSize = 1000;
    var param = {
        "type": "file",
        "data": {
            "fileSize": fileSize,
            "fileName": fileName
        }
    };
    localChannel.send(JSON.stringify(param));
    var fileReader = new FileReader();
    fileReader.onload = function() {
        localChannel.send(fileReader.result);
        if (done < fileSize) {
            tempLoad()
        }
    };
    var done = 0;
    var tempLoad = function() {
        fileReader.readAsArrayBuffer(fileData.slice(done, sendMaxSize + done));
        done = done + sendMaxSize
    };
    tempLoad()
});