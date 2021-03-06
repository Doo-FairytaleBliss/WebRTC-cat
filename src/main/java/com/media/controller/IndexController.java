package com.media.controller;

import java.io.IOException;
import java.util.ArrayList;

import javax.websocket.OnClose;
import javax.websocket.OnError;
import javax.websocket.OnMessage;
import javax.websocket.OnOpen;
import javax.websocket.Session;
import javax.websocket.server.ServerEndpoint;

import com.alibaba.fastjson.JSON;
import com.media.code.MessageTypeCode;
import com.media.config.FiveResponseConfig;
import com.media.config.MessageStructConfig;
import com.media.config.OneReadyResponseConfig;
import com.media.service.IndexService;
import com.media.storage.FiveHomeStorage;
import com.media.storage.MessageSendLockStorage;
import com.media.storage.PersonalSessionStorage;

@ServerEndpoint(value="/index")  
public class IndexController {
	//
	@OnOpen  
    public void open(Session session){  
		String id = session.getId();//程序运行，用户进入主页，获取session的Id，id就是左上角的个人编号，id怎么生成的？
		try{
			PersonalSessionStorage.addSessionById(id, session);//将id和session添加到storage中
			String ret = getRet(MessageTypeCode.PERSONAL_ID, id);//PERSONAL_ID("个人身份id", "0"), id;将这两项传递给一个消息传递机制，转换为json返回到这
			MessageSendLockStorage.addSendText(id, ret);//把id和这条消息的消息传送机制json字符给消息发送锁，给一个 一个session 发送消息,并且检测当前session 上一个消息还未发送完成之前,则堵塞起来
		}catch(Throwable e){
			PersonalSessionStorage.delSessionById(id);//捕获异常后退出，删除指定的id的session
			try {
				session.close();
			} catch (IOException e1) {
				e1.printStackTrace();
			}
			e.printStackTrace();
		}
    }  
	
    @OnMessage//onmessage是websocket的监听函数，监听服务器发来的消息触发的事件
    public void OnMessage(String message, Session session){ //message就是要进行的操作，session就是要求请求的人的Session
    	try{
	    	MessageStructConfig struct = JSON.parseObject(message,MessageStructConfig.class);//把message还原为消息传递结构
	    	switch (struct.getKey()) {//获取消息传递结构的Key,看要做什么操作
			case QUERY_ID://key是搜索个人操作
				MessageSendLockStorage.addSendText(session.getId(), getRet(MessageTypeCode.QUERY_ID,IndexService.queryId(session.getId(),struct.getValue().toString())));
				break;
			case READY_FOR_ONE:///key是一对一准备
				String remoteId = IndexService.readyForOne(session.getId(), struct.getValue().toString());
				MessageSendLockStorage.addSendText(remoteId,getRet(MessageTypeCode.READY_FOR_ONE,session.getId()));//给对方发送准备请求
				break;
			case READY_FOR_ONE_RESPONSE://一对一准备响应
				OneReadyResponseConfig ret = IndexService.readyForOneResponse(session.getId(),Boolean.parseBoolean(struct.getValue().toString()));
				MessageSendLockStorage.addSendText(ret.getOfferId(),getRet(MessageTypeCode.READY_FOR_ONE_RESPONSE,JSON.toJSONString(ret)));
				break;
			case SIGNALLING_OFFER://接收发送到服务端的信令
				OneReadyResponseConfig offerRet = IndexService.signallingOffer(session.getId());
				if(offerRet.isStatus()){//转发信令
					MessageSendLockStorage.addSendText(offerRet.getAnswerId(),getRet(MessageTypeCode.SIGNALLING_ONE_ANSWER,JSON.toJSONString(struct.getValue())));
					break;
				}else{//一对一找不到对话准备
					//查找是否有指定发送人
					if(struct.getTemp() != null){
						//检查指定发送人是否与当前发送人在同一个房间内
						String responseUserHomeId = FiveHomeStorage.getHomeIdByUserId(struct.getTemp().toString());
						String sendHomeId = FiveHomeStorage.getHomeIdByUserId(session.getId());
						if(responseUserHomeId != null && sendHomeId != null && responseUserHomeId.equals(sendHomeId)){//正常执行
							FiveResponseConfig fiveTemp = new FiveResponseConfig();
							fiveTemp.setSendUserId(session.getId());
							fiveTemp.setMsg(struct.getValue().toString());
							MessageSendLockStorage.addSendText(struct.getTemp().toString(),getRet(MessageTypeCode.SIGNALLING_FIVE_ANSWER,JSON.toJSONString(fiveTemp)));
							break;
						}
					}
					MessageSendLockStorage.addSendText(offerRet.getAnswerId(),getRet(MessageTypeCode.READY_FOR_ONE_RESPONSE,JSON.toJSONString(offerRet)));
					break;
				}
			case ONE_CHANNEL_CLOSE://发送了一对一通道关闭
				closeDialogue(session);
				break;
			case CREATE_GROUP_FIVE://创建五人群组房间
				String homeId = IndexService.createHome();
				IndexService.addHome(session.getId(), homeId);//自己立马加入到这个房间中
				MessageSendLockStorage.addSendText(session.getId(),getRet(MessageTypeCode.CREATE_GROUP_FIVE,homeId));
				break;
			case EXIT_GROUP_FIVE://退出五人群组房间
				closeDialogue(session);
				break;
			case QUERY_GROUP_FIVE://搜索并加入五人群组房间
				String queryHomeId = struct.getValue().toString();
				boolean addHomeRet = IndexService.addHome(session.getId(), queryHomeId);
				FiveResponseConfig fiveTemp = null;
				if(addHomeRet){//有人进入房间,给房间内其他用户发送消息
					ArrayList<String> userIds = FiveHomeStorage.getHomeUsersNotThis(queryHomeId, session.getId());
					for (String userId : userIds) {//每次的信令,发给所有人一份
						MessageSendLockStorage.addSendText(userId,getRet(MessageTypeCode.GROUP_FIVE_ADD_USER,session.getId()));
					}
					fiveTemp = new FiveResponseConfig();
					fiveTemp.setSendUserId(session.getId());
					fiveTemp.setMsg(struct.getValue().toString());
					fiveTemp.setHomeId(queryHomeId);
					ArrayList<String> youUserIds = FiveHomeStorage.getHomeUsersNotThis(queryHomeId,session.getId());
					fiveTemp.setUserIds(youUserIds.toArray(new String[youUserIds.size()]));
				}
				MessageSendLockStorage.addSendText(session.getId(),getRet(MessageTypeCode.QUERY_GROUP_FIVE,fiveTemp != null ? JSON.toJSONString(fiveTemp) : null));//返回房间内其他人的id
				break;
			default:
				break;
			}
    	}catch(Throwable e){
    		e.printStackTrace();
    	}
    	
    }  

    @OnError
    public void onError(Throwable t) {
    	t.printStackTrace();
    }
    
    @OnClose  
    public void close(Session session){//当关闭浏览器后,则删除session记录和对话准备
    	try{
    		closeDialogue(session);
	    	PersonalSessionStorage.delSessionById(session.getId());
    	}catch(Throwable e){
    		e.printStackTrace();
    	}finally {
    		try {
				session.close();
			} catch (IOException e) {
				e.printStackTrace();
			}
    	}
    }  
    
    /**
     * 删除对话,包括群组 个人
     */
    public void closeDialogue(Session session){
    	//并且给一对一对话 对方 发送关闭对话的通知,如果有在对话
		String closeRemoteId = IndexService.oneChannelClose(session.getId());
		MessageSendLockStorage.addSendText(closeRemoteId,getRet(MessageTypeCode.ONE_CHANNEL_CLOSE,true));
		//先给房内其他人发送退出信息
		String homeId = FiveHomeStorage.getHomeIdByUserId(session.getId());
		if(homeId != null){
			ArrayList<String> userIds = FiveHomeStorage.getHomeUsersNotThis(homeId, session.getId());
			for (String userId : userIds) {
				MessageSendLockStorage.addSendText(userId,getRet(MessageTypeCode.EXIT_GROUP_FIVE,session.getId()));
			}
		}
		IndexService.exitHome(session.getId());
    }
    
    /**
     * 发送消息结构
     * @param key
     * @param msg
     * @return
     */
    private String getRet(MessageTypeCode key,Object msg){
    	MessageStructConfig struct = new MessageStructConfig();
    	struct.setValue(msg);
    	struct.setKey(key);
		return JSON.toJSONString(struct);
    }
    
}
