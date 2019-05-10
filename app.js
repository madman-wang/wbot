'use strict';

var express = require('express');
var timeout = require('connect-timeout');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var AV = require('leanengine');
const Wechat = require('wechat4u')
const fs = require('fs')
const _ = require('lodash')

// 加载云函数定义，你可以将云函数拆分到多个文件方便管理，但需要在主文件中加载它们
require('./cloud');

var app = express();
let bot = new Wechat();

// 设置模板引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.static('public'));

// 设置默认超时时间
app.use(timeout('15s'));

// 加载云引擎中间件
app.use(AV.express());

app.enable('trust proxy');
// 需要重定向到 HTTPS 可去除下一行的注释。
// app.use(AV.Cloud.HttpsRedirect());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/', function(req, res) {
  res.render('index', { currentTime: new Date() });
});

app.get('/bot-start', function(req, res, next) {
  if (bot.state !== 'init') {
    return res.json({
      state: bot.state,
      qr: bot.qr,
    });
  }

  try {
    bot.start();
    bot.on('uuid', uuid => {
      const qr = 'https://login.weixin.qq.com/qrcode/' + uuid;
      bot.qr = qr;
      res.json({
        qr,
      });
    });
  } catch (e) {}
});

app.get('/bot-stop', function(req, res, next) {
  bot.stop();
  res.json('已停止');
});

app.get('/bot-send', function(req, res, next) {
  const contacts = _.filter(bot.contacts, value => {
    return value.NickName.indexOf(req.query.name || '消息推送') !== -1;
  });
  contacts.forEach(item => {
    bot.sendMsg(req.query.msg, item.UserName);
  });
  res.json({
    filter: contacts,
    // contacts: bot.contacts,
  });
});

// 可以将一类的路由单独保存在一个文件中
app.use('/todos', require('./routes/todos'));

app.use(function(req, res, next) {
  // 如果任何一个路由都没有返回响应，则抛出一个 404 异常给后续的异常处理器
  if (!res.headersSent) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  }
});

// error handlers
app.use(function(err, req, res, next) {
  if (req.timedout && req.headers.upgrade === 'websocket') {
    // 忽略 websocket 的超时
    return;
  }

  var statusCode = err.status || 500;
  if (statusCode === 500) {
    console.error(err.stack || err);
  }
  if (req.timedout) {
    console.error('请求超时: url=%s, timeout=%d, 请确认方法执行耗时很长，或没有正确的 response 回调。', req.originalUrl, err.timeout);
  }
  res.status(statusCode);
  // 默认不输出异常详情
  var error = {};
  if (app.get('env') === 'development') {
    // 如果是开发环境，则将异常堆栈输出到页面，方便开发调试
    error = err;
  }
  res.render('error', {
    message: err.message,
    error: error
  });
});

module.exports = app;
