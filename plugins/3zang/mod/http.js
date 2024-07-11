/**
 * @title http
 * @create_at 2024-07-10 10:12:09
 * @description request封装
 * @author 薛定谔的大灰机
 * @team 3zang
 * @version v1.0.5
 * @module true
 * @encrypt false
 * @public false
 */

const axios =require("axios")
module.exports ={
  request
}

async function request(options) {
  if (!options?.url) throw new Error('网址为必填项');
  
  try {
    const response = await axios({
      url: options.url,
      method: options?.method || 'GET',
      data: options?.data || {},
      params: options?.params || {},
      headers: options?.headers || {},
      responseType: options?.responseType || "",
      timeout: options?.timeout || 15000,
    });

    // 检查响应状态码
    if (response.status === 200) {
      // 如果需要，您可以将整个响应对象返回出去
      // 这样的话，调用者可以获取到响应体、状态码和头部信息等
      return {
        body: response.data, // 响应体
        status: response.status, // 状态码
        headers: response.headers // 响应头部
      };
    } else {
      // 如果状态码不是200，您可以选择如何处理
      // 这里返回null或者抛出错误
      return null;
    }
  } catch (err) {
    console.error(err);
    // 在这里处理错误，例如返回null或者抛出错误
    return null;
  }
}
