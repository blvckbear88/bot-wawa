process.on('uncaughtException', async (err, origin) => {
    console.log('error', err)
})

require('dotenv').config()

const express = require('express')
const createError = require('http-errors')
const path = require('node:path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')

const { connectToWhatsApp } = require(path.resolve('src/config/whatsapp.js'))
const { Helper } = require(path.resolve('src/helpers/index.js'))
const { logger: Log } = require(path.resolve('src/config/logger.js'))
const { webhookTokopay, webhookTokovoucher } = require(path.resolve('src/routes/index.js'))

const PORT = process.env.PORT || 3000
const SESSION = process.env.SESSION

const app = express()

global._sock;

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))
app.set('json spaces', 2)

app.post('/api/v1/tokopay/webhook', async (req, res) => {
    Log.info('Webhook tokopay received:', req.body)

    webhookTokopay(req, res, global._sock)
})

app.post('/api/v1/tokovoucher/webhook', async (req, res) => {
    Log.info('Webhook tokovoucher received:', req.body)

    webhookTokovoucher(req, res, global._sock)
})

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404))
})

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message
    res.locals.error = req.app.get('env') === 'development' ? err : {}

    // render the error page
    res.status(err.status || 500)
    res.json({message: err.message})
})

app.listen(PORT, async () => {
    var sessions = SESSION === undefined ? Helper.generateUuidV4() : SESSION
    sessions = `src/sessions/${sessions}`

    var { sock } = await connectToWhatsApp(sessions)
    global._sock = sock
    
    console.log('[*] SERVER LISTEN ON PORT:', PORT)
})

module.exports = {
    app,
    sock: global._sock
}
