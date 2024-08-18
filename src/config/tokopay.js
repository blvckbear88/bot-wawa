require('dotenv').config()

const path = require('node:path')
const crypto = require('node:crypto')
const axios = require('axios')

const { queue } = require(path.resolve('src/config/queue.js'))
const { logger: Log } = require(path.resolve('src/config/logger.js'))

const ENDPOINT_URL_API = {
    INFO_ACCOUNT_URL: 'https://api.tokopay.id/v1/merchant',
    CREATE_ORDER: 'https://api.tokopay.id/v1/order'
}

const generateSignature = (merchantId, secretKey, reff_id) => {
    var signature = crypto.createHash('md5').update(`${merchantId}:${secretKey}${reff_id ? `:${reff_id}` : ''}`).digest('hex')
    return signature
}

const infoAccountTokopay = (merchantId, secretKey) => {
    return new Promise( async (resolve, reject) => {
        var job = queue.create('fetch tokopay', { 
            title: 'fetch tokopay infoAccountTokopay'
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process('fetch tokopay', async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Tokopay infoAccountTokopay`)

            try {
                let signature = generateSignature(merchantId, secretKey)
                var { data } = await axios.post(ENDPOINT_URL_API.INFO_ACCOUNT_URL, {
                    merchant_id: merchantId,
                    signature: signature
                })
    
                resolve({
                    response: data,
                    error: null
                })

                done()
            } catch ({ response: error }) {
                reject({
                    response: null,
                    error: error
                })

                return done(new Error(error));
            }
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
    })
}

const createSimpleOrder = (merchantId, secretKey, refId, nominal, metode) => {
    return new Promise( async (resolve, reject) => {
        var job = queue.create('fetch tokopay', { 
            title: 'fetch tokopay createSimpleOrder'
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process('fetch tokopay', async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Tokopay createSimpleOrder`)
        
            try {
                let url = `${ENDPOINT_URL_API.CREATE_ORDER}?merchant=${merchantId}&secret=${secretKey}&ref_id=${refId}&nominal=${nominal}&metode=${metode}`
                var { data: { data } } = await axios.get(url)
    
                resolve({
                    response: data,
                    error: null
                })

                done()
            } catch ({ response: error }) {
                reject({
                    response: null,
                    error: error
                })

                return done(new Error(JSON.stringify(error)));
            }
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
    })
}

const createAdvancedOrder = (merchantId, secretKey, refId, nominal, metode, { products = [], user = {} } = {}) => {
    return new Promise( async (resolve, reject) => {
        if (typeof refId !== 'undefined') {
            var job = queue.create(`fetch tokopay ${refId}`, { 
                title: `fetch tokopay createAdvancedOrder #${refId}` 
            }).delay(4_000).save( function(err){
                if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
            })
    
            queue.process(`fetch tokopay ${refId}`, async (_, done) => {
                Log.info(`[JOB QUEUE IS PROCESS]: Fetch Tokopay createAdvancedOrder #${refId}`)
            
                var dateNow = new Date()
                dateNow.setMinutes(dateNow.getMinutes() + 15) // 15 minutes of expires payment gateaway
                dateNow = Math.floor(dateNow.getTime() / 1000)
                
                try {
                    let signature = generateSignature(merchantId, secretKey, refId)
                    let url = `${ENDPOINT_URL_API.CREATE_ORDER}`
    
                    var { data: { data } } = await axios.post(url, {
                        merchant_id: merchantId,
                        signature: signature,
                        reff_id: refId,
                        amount: nominal,
                        kode_channel: metode,
                        items: products,
                        customer_name: user?.pushName,
                        customer_phone: user?.number,
                        customer_email: `${user?.number}@gmail.com`,
                        expired_ts: dateNow,
                        redirect_url: null,
                    })
    
                    Log.info('TOKOPAY RESPONSE:', data)
                    resolve({
                        response: data,
                        error: null
                    })
    
                    done()
                } catch (error) {
                    Log.info('TOKOPAY ERROR RESPONSE:', error)
                    reject({
                        response: null,
                        error: error
                    })
    
                    return done(new Error(JSON.stringify(error)));
                }
            })
    
            job.on('complete', function(result){
                Log.info(`[JOB QUEUE IS COMPLETED] #${refId}`);
            }).on('failed attempt', function(errorMessage, doneAttempts){
                Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: #${refId} : ${errorMessage}`);
            }).on('failed', function(errorMessage){
                Log.error(`[JOB QUEUE IS FAILED]: #${refId} : ${errorMessage}`);
            }).on('progress', function(progress, data){
                Log.info('\rjob #' + job.id + ' ' + progress + '% complete with data ', data );
            })
        }
    })
}

module.exports = {
    generateSignature,
    infoAccountTokopay,
    createSimpleOrder,
    createAdvancedOrder
}