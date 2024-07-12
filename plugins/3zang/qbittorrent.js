/**
 * @author 3zang
 * @name qbittorrent
 * @team 3zang
 * @version 1.0.0
 * @description qbtitorrent下载器
 * @rule ^/down$
 * @rule ^magnet:(.+)$
 * @admin false
 * @public true
 * @priority 100
 * @disable false
 * @classification ["娱乐"]
 */
/* 配置构造器 */
const jsonSchema = BncrCreateSchema.object({
  enable: BncrCreateSchema.boolean().setTitle('是否开启Qbit').setDescription(`设置false则不启用`).setDefault(false),
  baseURL: BncrCreateSchema.string().setTitle('地址').setDescription(`qbittorrent的地址和端口`).setDefault('http://192.168.0.47:1234'),
  userName: BncrCreateSchema.string().setTitle('账号').setDescription(`账号`).setDefault('Yanshen'),
  password: BncrCreateSchema.string().setTitle('密码').setDescription(`密码`).setDefault('678901'),
  savePath: BncrCreateSchema.string().setTitle('保存路径').setDescription(`添加种子时的保存路径`).setDefault('/nas/监听')
});
const mod = require('./mod/http')
const moment = require('moment');
const axios = require('axios')
const qs = require('qs')
const qb = new BncrDB("qbittorent")
/* 配置管理器 */
const ConfigDB = new BncrPluginConfig(jsonSchema)

var { baseURL, userName, passwd, savepath, headers } = ''
//初始化
!(async () => {
  await ConfigDB.get();
  baseURL = ConfigDB.userConfig.baseURL + "/api/v2" || ""
  //账号
  userName = ConfigDB.userConfig.userName || "";
  //密码
  passwd = ConfigDB.userConfig.password || "";
  //监听的保存路径
  savepath = ConfigDB.userConfig.savePath || "";
})().catch((e) => console.log(e)).finally();

module.exports = async s => {
  /* 如果用户未配置,userConfig则为空对象{} */
  if (!Object.keys(ConfigDB.userConfig).length) {
    sysMethod.startOutLogs('未配置Qbittorrent,退出.');
    return;
  }
  //登录
  await init()
  headers = await qb.get("headers")
  var keyword = s.param(1) + "";
  console.log("输入:", keyword)
  if (keyword.match(/xt=urn/)) {
    keyword = "magnet:" + keyword
    let add = await addMagnet({ urls: keyword, savepath: savepath })
    if (add == true) {
      await s.reply("种子添加完成~")
    } else {
      await s.reply("种子添加失败~")
    }
  }
  const down = await downloading()
  const download = "正在下载:\n" + down.down + "\n"
  const dsped = await downspeed()
  const msg = "下载速度 : " + dsped.d_speed + "\n上传速度 : " + dsped.u_speed + "\n累计下载 : " + dsped.dl_info + "\n累计上传 : " + dsped.up_info + ""
  const diskinfo = await diskSpace()
  const replyText = (download + msg + "\n" + diskinfo)
  await s.reply(replyText)
}

/**
 * 登录
 */
async function init() {
  const login = await axios.post(baseURL + '/auth/login', qs.stringify({ username: `${userName}`, password: `${passwd}` }))
  const dataStr = JSON.stringify(login.data)
  const data = JSON.parse(dataStr)
  console.log("登录结果:", data)
  var cookieStr = JSON.stringify(login.headers['set-cookie'])
  const cookie = JSON.parse(cookieStr)[0]
  headers = { 'Cookie': cookie.split(";")[0] };
  qb.set("headers", headers)
  console.log(`使用Cookie:${headers.Cookie} 连接到qbtorrent下载器,开始处理请求!`)
}
/**
 * 添加磁力
 */
async function addMagnet(data) {
  var success = false
  let formData = new FormData();
  formData.append('urls',data.urls);
  formData.append('savepath',data.savepath)
  formData.append('upLimit', 10240)
  var res = await axios.post(baseURL + "/torrents/add", formData,{ headers: headers })
  console.log("添加种子:",res.data)
  if (res.data.match(/Ok/)) {
    success = true
  }
  return success
}

/**
 * 下载中的任务
 */
async function downloading() {
  var res = await mod.request({ url: baseURL + "/torrents/info?filter=downloading", dataType: "json", headers: headers })
  var down_loading = res.body
  let torrents = []
  let ok = ""
  if (down_loading) {
    for (let i = 0; i < down_loading.length; i++) {
      var torrent = {}
      torrent.name = down_loading[i].name;
      torrent.id = i + 1
      const progess = down_loading[i].progress;
      torrent.progess = "进度: " + (progess * 100).toString().substring(0, 4) + "%"
      console.log("下载中 : "+torrent.name, " : ", torrent.progess)
      torrent.hash = down_loading[i].hash
      torrent.path = down_loading[i].save_path
      torrents.push(torrent)
      if (torrent.path.match(savepath)) {
        //限制上传速度
        //setUploadLimit(torrent.hash)
      }
      ok += torrent.id + ". " + torrent.name + '  ' + torrent.progess + '\n';
    }
    if (down_loading.length == 0) {
      ok = "没有下载中的任务!"
    }
  }
  let result = {}
  result.torrents = torrents
  result.down = ok.substring(0, ok.length - 1)
  return result
}
/**
 * 限速
 * @param hash
 */
async function setUploadLimit(hash) {
  const hashInfo = await torrentHashInfo(hash)
  let reqUrl = baseURL + "/torrents/setUploadLimit"
  let body = { hashes: hash, limit: 10240 }
  console.log("限制: ", hashInfo.data.torrent, "上传速度:", body.limit / 1024 + "Kb")
  let data = await axios.post(reqUrl, qs.stringify(body), { headers: headers })
}

/**
 * 磁盘空间
 */
async function diskSpace() {
  let res = await axios.post(baseURL + "/sync/maindata?rid=0&l8gxujbi", null, { headers: headers })
  const data = JSON.parse(JSON.stringify(res.data))
  let server_state = data.server_state
  if (server_state) {
    let stat = server_state.free_space_on_disk
    return "磁盘可用 : " + (stat / (Math.pow(1024, 3))).toFixed(2) + " GB"
  }
  else
    return null
}


//URL encoded form (application/x-www-form-urlencoded)
async function addTags(tag, hash) {
  const hashInfo = await torrentHashInfo(hash)
  console.log("添加TAG:" + " *" + tag + " => " + hashInfo.data.torrent)
  let tagUrl = baseURL + "/torrents/addTags"
  let body = { 'hashes': hash, 'tags': tag }
  let addResult = await axios.post(tagUrl, qs.stringify(body), { headers: await getCacheHeader() })
}


/**
 * 分析
 */
async function analysis() {
  var data = {}
  var res = await mod.request({ url: qbApi + "/analysis", method: "get", json: true })
  var used = 0
  var total = 0
  var real = 0
  var disks = res.body.data
  disks.forEach(disk => {
    used += parseFloat(disk.used_space.split(" ")[0])
    total += parseInt(disk.torrents_num)
    real += parseInt(disk.real_num)
  })
  data.used = used;
  data.total = total
  var tips = "种子数量 : " + total + "/" + real + " 个\n" + "已用空间 : " + used.toFixed(2) + " GB"
  console.log(tips)
  return tips
}


/**
 * 瞬时下载速度
 */
async function downspeed() {
  let res = await mod.request({ url: baseURL + "/transfer/info", dataType: "json", headers: headers })
  var data = res.body
  let msg = {}
  let m = Math.pow(1024, 2)//MB
  let n = m * 1024 //GB
  if (data) {
    let d_speed = data.dl_info_speed / m
    let u_speed = data.up_info_speed / m
    let dl_info = data.dl_info_data / n
    let up_info = data.up_info_data / n
    msg.d_speed = d_speed.toString().substring(0, 4) + " MB/s"
    msg.u_speed = u_speed.toString().substring(0, 4) + " MB/s"
    msg.dl_info = dl_info.toString().substring(0, 6) + " GB"
    msg.up_info = up_info.toString().substring(0, 6) + " GB"
  }
  return msg
}


/**
 * 登录qbtiorrtent
 **/
async function torrentHashInfo(hash) {
  let result = {}
  let data = {}
  let format = 'YYYY-MM-DD HH:mm:ss'
  let hash_url = baseURL + "/torrents/info?hashes=" + hash
  let hashInfo = await axios.get(hash_url, { headers: headers })
  let qbInfo = hashInfo.data[0];//种子信息
  let add_on = qbInfo.added_on;
  let completion_on = qbInfo.completion_on
  let cost_on = completion_on - add_on
  let qb_name = qbInfo.name;
  let save_path = qbInfo.save_path;
  let size = qbInfo.size
  let tips =
    "- 种子名称 : " + qb_name + "\n" +
    "- 添加时间 : " + moment(add_on * 1000).format(format) + "\n" +
    "- 完成时间 : " + moment(completion_on * 1000).format(format) + "\n" +
    "- 下载用时 : " + formatSeconds(cost_on) + "\n" +
    "- 文件大小 : " + formatBytes(size);
  data.torrent = qbInfo.name
  data.tags = qbInfo.tags
  data.state = qbInfo.state
  data.category = qbInfo.category
  data.save_path = save_path
  data.add_time = moment(add_on * 1000).format(format)
  data.finish_time = moment(completion_on * 1000).format(format)
  data.cost_time = formatSeconds(cost_on)
  data.size = formatBytes(size);
  data.tips = tips
  result.code = 200
  result.data = data
  return result

}

/**
 *文件大小转换
 */
async function formatBytes(bytes) {
  const MiB = 1024 * 1024;
  const GiB = 1024 * 1024 * 1024;

  if (bytes >= GiB) {
    return (bytes / GiB).toFixed(2) + ' GB';
  } else {
    return (bytes / MiB).toFixed(2) + ' MB';
  }
}

/**
 *秒转换
 */
async function formatSeconds(seconds) {
  const SECONDS_IN_MINUTE = 60;
  const MINUTES_IN_HOUR = 60;
  const HOURS_IN_DAY = 24;

  let remainingSeconds = seconds;

  const days = Math.floor(remainingSeconds / (SECONDS_IN_MINUTE * MINUTES_IN_HOUR * HOURS_IN_DAY));
  remainingSeconds -= days * SECONDS_IN_MINUTE * MINUTES_IN_HOUR * HOURS_IN_DAY;

  const hours = Math.floor(remainingSeconds / (SECONDS_IN_MINUTE * MINUTES_IN_HOUR));
  remainingSeconds -= hours * SECONDS_IN_MINUTE * MINUTES_IN_HOUR;

  const minutes = Math.floor(remainingSeconds / SECONDS_IN_MINUTE);
  remainingSeconds -= minutes * SECONDS_IN_MINUTE;

  if (days > 0) {
    return `${days}天${hours}小时${minutes}分钟${remainingSeconds}秒`;
  }
  return `${hours}小时${minutes}分钟${remainingSeconds}秒`;
}
