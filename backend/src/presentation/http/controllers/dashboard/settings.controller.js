function getWebhookSettings(req, res) {
  res.json({
    verifyToken: process.env.FB_VERIFY_TOKEN ? '***configured***' : null,
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN ? '***configured***' : null,
    appSecret: process.env.FB_APP_SECRET ? '***configured***' : null,
    webhookUrl: `${req.protocol}://${req.get('host')}/webhook`,
  });
}

module.exports = {
  getWebhookSettings,
};
