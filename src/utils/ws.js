/**
 * WebSocket 服务器类
 * @param {number} port - 服务器监听的端口号，默认为9101
 * @param {Object} options - 包含服务器配置选项的对象
 * @param {number} options.restartInterval - 重启间隔时间，默认为1000毫秒
 * @param {string} options.heartBeatMessage - 心跳检测消息，默认为'Ping'
 * @param {string} options.heartBeatResponse - 心跳检测响应，默认为'Pong'
 * @param {number} options.heartBeatInterval - 心跳检测间隔时间，默认为1000毫秒
 * @param {string} options.token - Token 令牌
 */
class XPack_WebSocket {
  /**
   * 事件处理函数集合
   * @type {object}
   */
  #_Events = {};
  /////////////////////////////////////////////////////
  /**
   * 端口
   * @type {number}
   */
  #_Port = 9000;
  /**
   * WebSocket 实例
   * @type {WebSocket | null}
   */
  #_Socket = null;
  /////////////////////////////////////////////////////
  /**
   * 重连间隔时间（毫秒）
   * @type {number}
   */
  #_RestartInterval = 1000;
  /**
   * 重连定时器实例
   * @type {number | null}
   */
  #_RestartTimer = null;
  /////////////////////////////////////////////////////
  /**
   * 心跳状态
   * @type {boolean}
   */
  #_HeartBeatStatus = false;
  /**
   * 心跳消息内容
   * @type {string}
   */
  #_HeartBeatMessage = "Ping";
  /**
   * 心跳响应内容
   * @type {string}
   */
  #_HeartBeatResponse = "Pong";
  /**
   * 心跳发送间隔（毫秒）
   * @type {number}
   */
  #_HeartBeatInterval = 1000;
  /**
   * 心跳定时器实例
   * @type {number | null}
   */
  #_HeartBeatTimer = null;
  /**
   * 心跳响应事件处理函数
   * @type {{handle: function(*): void, eventFlag: string}}
   */
  #HeartBeatEventHandle = {
    eventFlag: "HeartBeat",
    handle: (data) => {
      if (data === this.#_HeartBeatResponse) {
        if (this.#_HeartBeatStatus) {
          this.#HeartBeatAction();
        }
      }
    },
  };
  /**
   * Token 令牌
   * @type {string}
   */
  #_Token = "";

  /////////////////////////////////////////////////////
  /**
   * 构造函数，用于初始化WebSocket服务器的配置
   * @param {number} port - 服务器监听的端口号，默认为9101
   * @param {Object} options - 包含服务器配置选项的对象
   * @param {number} options.restartInterval - 重启间隔时间，默认为1000毫秒
   * @param {string} options.heartBeatMessage - 心跳检测消息，默认为'Ping'
   * @param {string} options.heartBeatResponse - 心跳检测响应，默认为'Pong'
   * @param {number} options.heartBeatInterval - 心跳检测间隔时间，默认为1000毫秒
   * @param {string} options.token - Token 令牌
   */
  constructor(port = 9000, options = {}) {
    this.#_Port = port || 9000;
    this.#_RestartInterval = options.restartInterval || 1000;
    this.#_HeartBeatMessage = options.heartBeatMessage || "Ping";
    this.#_HeartBeatResponse = options.heartBeatResponse || "Pong";
    this.#_HeartBeatInterval = options.heartBeatInterval || 10 * 1000;
    this.#_Token = options.token || "";

    this.EventAdd(
      this.#HeartBeatEventHandle.eventFlag,
      this.#HeartBeatEventHandle.handle
    );
  }

  /**
   * 获取连接状态
   * @returns {null|boolean} 连接状态，true 表示连接成功，false 表示连接失败或未连接
   */
  get Status() {
    return this.#_Socket && this.#_Socket.readyState === WebSocket.OPEN;
  }

  /**
   * 事件订阅
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  /**
   * 事件订阅
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  EventAdd(event, handler) {
    console.log(`Adding event: ${event}`);
    if (!this.#_Events[event]) {
      this.#_Events[event] = handler;
      console.log(`Event ${event} added successfully`);
    }
  }

  /**
   * 移除事件监听
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  EventRemove(event) {
    console.log(`Removing event: ${event}`);
    if (this.#_Events[event]) {
      console.log(`Event ${event} removed successfully`);
      this.#_Events[event] = null;
    } else {
      console.log(`Event ${event} not found`);
    }
  }

  /**
   * 事件触发
   * @param {string} event - 事件名称
   * @param {...*} args - 事件参数
   */
  EventTrigger(event, ...args) {
    if (this.#_Events[event]) {
      this.#_Events[event](...args);
    }
  }

  /**
   * 移除事件监听
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */

  EventRemove(event) {
    console.log(`Removing event: ${event}`);
    if (this.#_Events[event]) {
      console.log(`Event ${event} removed successfully`);
      this.#_Events[event] = null;
    } else {
      console.log(`Event ${event} not found`);
    }
  }

  /**
   * 重连启动
   */
  #RestartStart() {
    this.#_RestartTimer = setTimeout(() => {
      this.#_Socket = null;
      console.log("WebSocket 服务器连接失败，正在尝试重新连接...");
      this.#connectWithToken();
    }, this.#_RestartInterval);
  }

  /**
   * 重连停止
   */
  #RestartStop() {
    if (this.#_RestartTimer) {
      clearTimeout(this.#_RestartTimer);
      this.#_RestartTimer = null;
    }
  }

  /**
   * 心跳动作
   */
  #HeartBeatAction() {
    this.#_HeartBeatTimer = setTimeout(() => {
      if (this.#_Socket && this.#_Socket.readyState === WebSocket.OPEN) {
        this.Send({
          eventFlag: this.#HeartBeatEventHandle.eventFlag,
          data: this.#_HeartBeatMessage,
        });
        this.#_HeartBeatTimer = null;
      }
    }, this.#_HeartBeatInterval);
  }

  /**
   * 启动心跳检测
   */
  HeartBeatStart() {
    if (!this.#_HeartBeatStatus) {
      this.#_HeartBeatStatus = true;
      this.#HeartBeatAction();
    }
  }

  /**
   * 停止心跳检测
   */
  HeartBeatStop() {
    if (this.#_HeartBeatStatus) {
      this.#_HeartBeatStatus = false;
      if (this.#_HeartBeatTimer) {
        clearTimeout(this.#_HeartBeatTimer);
        this.#_HeartBeatTimer = null;
      }
    }
  }

  /////////////////////////////////////////////////////
  /**
   * 连接成功【回调函数】
   * @param event - 连接成功事件对象
   */
  OnOpen(event) {
    console.log("Websocket 服务器连接成功：", event);
    this.#RestartStop();
    this.HeartBeatStart();
  }

  /**
   * 收到服务器消息【回调函数】
   * @param event - 收到服务器消息的事件对象
   */
  OnMessage(event) {
    try {
      const jsonData = JSON.parse(event.data);
      // console.log("服务器[WebSocket]：收到数据：", jsonData);
      this.EventTrigger(jsonData.eventFlag, jsonData.data);
    } catch (e) {
      console.log(
        "服务器[WebSocket]：数据[" +
          event.data +
          "]解析失败，请检查数据格式是否正确！"
      );
    }
  }

  /**
   * 连接关闭【回调函数】
   * @param event - 连接关闭事件对象
   */
  OnClose(event) {
    console.log("Websocket 服务器连接关闭：", event.reason);
    this.HeartBeatStop();
    if (event.reason !== "ServerShutDown") {
      this.#RestartStart();
    }
  }

  /**
   * 发生错误【回调函数】
   * @param error - 错误对象
   */
  OnError(error) {
    console.error("Websocket 服务器发生错误：", error);
  }

  /**
   * 建立与服务器的连接
   */
  #connectWithToken() {
    const url = `ws://localhost:${this.#_Port}/ws`; // 设备
    let webSocket;

    // 关键修复：无Token时不传子协议，有Token时传Token作为子协议
    if (this.#_Token) {
      webSocket = new WebSocket(url, this.#_Token); // 有Token：传Token作为子协议
    } else {
      webSocket = new WebSocket(url); // 无Token：只传url，不传子协议
    }

    this.#_Socket = webSocket;
    this.#_Socket.onopen = (event) => this.OnOpen(event);
    this.#_Socket.onmessage = (event) => this.OnMessage(event);
    this.#_Socket.onclose = (event) => this.OnClose(event);
    this.#_Socket.onerror = (error) => this.OnError(error);
  }

  /**
   * 关闭与服务器的连接
   */
  Close() {
    this.HeartBeatStop(); // 停止心跳检测
    this.#RestartStop(); // 停止重连逻辑

    if (this.#_Socket) {
      this.#_Socket.onopen = null; // 清除事件监听器
      this.#_Socket.onmessage = null;
      this.#_Socket.onclose = null;
      this.#_Socket.onerror = null;

      this.#_Socket.close(); // 关闭 WebSocket 连接
      this.#_Socket = null; // 释放 WebSocket 实例
    }

    console.log("WebSocket 已关闭");
  }
  /**
   * 发送消息
   * @param message - 要发送的消息
   */
  Send(message) {
    if (this.#_Socket && this.#_Socket.readyState === WebSocket.OPEN) {
      this.#_Socket.send(JSON.stringify(message));
    }
  }

  /**
   * 设置 Token 并连接
   * @param {string} token - Token 令牌
   * @returns {Promise<number>} - 返回一个 Promise，包含识别码
   */
  init(token) {
    return new Promise((resolve, reject) => {
      this.#_Token = token;
      this.#connectWithToken(); // 建立连接（事件绑定在#connectWithToken中）

      // 监听连接状态：用setTimeout轮询，避免直接依赖onopen（防止覆盖）
      const checkConnTimer = setInterval(() => {
        // 通过Status属性判断是否连接成功
        if (this.Status) {
          clearInterval(checkConnTimer);
          resolve(200); // 连接成功，resolve
        }
      }, 100); // 每100ms检查一次

      // 监听连接失败：超过5秒未成功则判定为失败
      const timeoutTimer = setTimeout(() => {
        clearInterval(checkConnTimer);
        reject(new Error("连接超时（5秒）"));
      }, 5000);

      // 连接关闭时的处理（覆盖原onclose，仅用于Promise reject）
      const originalOnClose = this.#_Socket.onclose;
      this.#_Socket.onclose = (event) => {
        originalOnClose.call(this, event); // 先执行原有的onclose逻辑
        clearInterval(checkConnTimer);
        clearTimeout(timeoutTimer);
        if (event.code !== 1000) {
          // 1000是正常关闭，其他是异常关闭
          reject(new Error(`连接关闭，代码: ${event.code}`));
        }
      };

      // 连接错误时的处理（覆盖原onerror，仅用于Promise reject）
      const originalOnError = this.#_Socket.onerror;
      this.#_Socket.onerror = (error) => {
        originalOnError.call(this, error); // 先执行原有的onerror逻辑
        clearInterval(checkConnTimer);
        clearTimeout(timeoutTimer);
        reject(error);
      };
    });
  }
}

/**
 * 默认WebSocket服务
 * @param {import('vue').App} app - Vue 应用实例
 * @param {Object} options - 包含服务器配置选项的对象
 * @param {number} options.port - 服务器监听的端口号，默认为9101
 * @param {Object} options.options - 包含服务器配置选项的对象
 * @param {number} options.options.restartInterval - 重启间隔时间，默认为1000毫秒
 * @param {string} options.options.heartBeatMessage - 心跳检测消息，默认为'Ping'
 * @param {string} options.options.heartBeatResponse - 心跳检测响应，默认为'Pong'
 * @param {number} options.options.heartBeatInterval - 心跳检测间隔时间，默认为1000毫秒
 * @param {string} options.options.token - Token 令牌
 */
let XPack_WebSocketDefault = function (app, options = {}) {
  app.config.globalProperties.$XPack_WebSocket = new XPack_WebSocket(
    options.port,
    options.options
  );
  // 不自动连接
  // app.config.globalProperties.$XPack_WebSocket.Connect();
};
/**
 * 默认WebSocket服务导出
 */
export default XPack_WebSocketDefault;
