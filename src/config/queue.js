const path = require('node:path')
const kue = require('kue')

const { logger: Log } = require(path.resolve('src/config/logger.js'))
const { Helper } = require(path.resolve('src/helpers/index.js'))

/* const queue = kue.createQueue({
    prefix: 'q',
    redis: {
        socket: '/home/kodingke/redis.sock',
        db: 1,
    }
}) */

const queue = kue.createQueue()

const Sock = {}
Sock.sock = null

Sock.sendTextMessage = async function (remoteJid, {
    text,
    options = {}
} = {}) {
    var jobKey = Helper.generateUuidV4()
    var job = queue.create(`send message ${jobKey}`, {
        title: `Send Message to ${remoteJid.split('@')[0]}`,
        remoteJid: remoteJid,
        message: text,
        options: options
    }).delay(1_000).save(function(err){
        if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
    })

    queue.process(`send message ${jobKey}`, async ({ data: { remoteJid: _remoteJid, message, options }}, done) => {
        Log.info(`[JOB QUEUE IS PROCESS]: Send Message To ${_remoteJid.split('@')[0]}`)
        
        var msg = await Sock.sock.sendMessage(_remoteJid, { text: message }, { ...options })

        done(null, message)
    })

    job.on('complete', function(result){
        Log.info('[JOB QUEUE IS COMPLETED]');
    }).on('failed attempt', function(errorMessage, doneAttempts){
        Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
    }).on('failed', function(errorMessage){
        Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
    }).on('progress', function(progress, data){
        Log.info('\rjob #' + job.id + ' ' + progress + '% complete with data ', data );
    })
}

Sock.sendImageMessage = async function (remoteJid, {
    image,
    caption
} = {}) {
    var job = queue.create('send image message', {
        title: `Send Image Message to ${remoteJid.split('@')[0]}`,
        remoteJid: remoteJid,
        image: image,
        caption: caption,
    }).delay(4_000).save(function(err){
        if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
    })

    queue.process('send image message', async ({ data: { remoteJid: _remoteJid, image, caption }}, done) => {
        Log.info(`[JOB QUEUE IS PROCESS]: Send Image Message To ${_remoteJid.split('@')[0]}`)
        
        await Sock.sock.sendMessage(_remoteJid, { 
            image,
            caption  
        })

        done(null, caption)
    })

    job.on('complete', function(result){
        Log.info('[JOB QUEUE IS COMPLETED]');
    }).on('failed attempt', function(errorMessage, doneAttempts){
        Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
    }).on('failed', function(errorMessage){
        Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
    }).on('progress', function(progress, data){
        Log.info('\rjob #' + job.id + ' ' + progress + '% complete with data ', data );
    })
}

queue.on('error', function(err) {
    console.log('Oops... ', err)
})

process.once('SIGTERM', function(sig) {
    queue.shutdown(5_000, function(err) {
        console.log('Kue shutdown:', err || '-' )
        process.exit(0)
    })
})

// clear complete jobs
kue.Job.rangeByState('complete', 0, 1000, 'asc', function( err, jobs ) {
    jobs.forEach(function(job) {
        job.remove( function(){
            console.log('[*] Queue completed removed: ', job.id );
        })
    })
})

module.exports = {
    queue,
    Sock
}
