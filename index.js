/*
 * File: index.js                                                              *
 * Project: educative-apigateway-34-multiuserchat                              *
 * Created Date: 04 Sep 2022                                                   *
 * Author: Vikas K Solegaonkar (vikas@crystalcloudsolutions.com)               *
 * Copyright (c) 2022 Vikas K Solegaonkar                                      *
 * Crystal Cloud Solutions (https://crystalcloudsolutions.com)                 *
 *                                                                             *
 * Last Modified: Thu Sep 08 2022                                              *
 * Modified By: Vikas K Solegaonkar                                            *
 *                                                                             *
 * HISTORY:                                                                    *
 * ----------	---	---------------------------------------------------------    *
 * Date      	By	Comments                                                     *
 * ----------	---	---------------------------------------------------------    *
 */

const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

/**
 * When connected to the WebSocket, add records in the DB so that
 * the user can be identified with connection
 *
 * @param {*} event
 */
const onConnect = async (event) => {
  await ddb
    .put({
      TableName: "WebSocketConnections",
      Item: {
        context: "Connection",
        id: event.requestContext.connectionId,
        userName: event.headers.msgfrom,
        friendName: event.headers.msgto,
      },
    })
    .promise();
  await ddb
    .put({
      TableName: "WebSocketConnections",
      Item: {
        context: "User",
        id: event.headers.msgfrom,
        friendName: event.headers.msgto,
        connectionId: event.requestContext.connectionId,
      },
    })
    .promise();
};

/**
 * When a user disconnects, cleanup the records in DB
 * @param {*} event
 */
const onDisconnect = async (event) => {
  await ddb
    .delete({
      TableName: "WebSocketConnections",
      Key: {
        context: "Connection",
        id: event.requestContext.connectionId,
      },
    })
    .promise();
};

/**
 * On getting a message, forward it to the friend
 * @param {*} event
 */
const onMessage = async (event) => {
  /**
   * Get the user's record based on connection id
   */
  var response = await ddb
    .get({
      TableName: "WebSocketConnections",
      Key: {
        context: "Connection",
        id: event.requestContext.connectionId,
      },
    })
    .promise();

  /**
   * Get the friend's record based on user id
   */
  response = await ddb
    .get({
      TableName: "WebSocketConnections",
      Key: {
        context: "User",
        id: response.Item.friendName,
      },
    })
    .promise();

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: "2018-11-29",
    endpoint: `https://${event.requestContext.apiId}.execute-api.us-east-1.amazonaws.com/v1`,
  });

  /**
   * Send the message to friend
   */
  await apigwManagementApi
    .postToConnection({
      ConnectionId: response.Item?.connectionId,
      Data: event.body || "",
    })
    .promise()
    .catch(async (e) => {
      console.log(e);
      return await apigwManagementApi
        .postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: "Your friend is not reachable. Connect from the other terminal and then try again",
        })
        .promise();
    });
};

exports.handler = async (event) => {
  if (event.requestContext.routeKey === "$connect") {
    /**
     * If this is a connect message, add the DB records
     */
    await onConnect(event);
  } else if (event.requestContext.routeKey === "$disconnect") {
    /**
     * If this is a disconnect message, clear the DB records
     */
    await onDisconnect(event);
  } else if (event.requestContext.routeKey === "$default") {
    /**
     * Forward the message to friend
     */
    await onMessage(event);
  }
  return { statusCode: 200, body: event.body || "{}" };
};
