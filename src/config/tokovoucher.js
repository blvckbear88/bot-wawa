require('dotenv').config()

const path = require('node:path')
const axios = require('axios')
const crypto = require('node:crypto');

const { Helper } = require(path.resolve('src/helpers/index.js'))
const { logger: Log } = require(path.resolve('src/config/logger.js'))
const { queue } = require(path.resolve('src/config/queue.js'))
const { generateSignature } = require(path.resolve('src/config/tokopay.js'))

const ENDPOINT_URL_API = {
    PRODUCT_CATEGORY_LIST_URL: 'https://api.tokovoucher.id/member/produk/category/list',
    PRODUCT_OPERATOR_LIST_URL: 'https://api.tokovoucher.id/member/produk/operator/list',
    PRODUCT_JENIS_LIST_URL: 'https://api.tokovoucher.id/member/produk/jenis/list',
    PRODUCT_LIST_URL: 'https://api.tokovoucher.id/member/produk/list',
    PRODUCT_TRANSACTION: 'https://api.tokovoucher.id/v1/transaksi',
    PRODUCT_TRANSACTION_STATUS: 'https://api.tokovoucher.id/v1/transaksi/status',
}

const { TOKOVOUCHER_SECRET_KEY, TOKOVOUCHER_MEMBER_CODE } = process.env

const getCategoryList = (memberCode, signature) => {
    return new Promise( async (resolve, reject) => {
        var jobKey = Helper.generateUuidV4()
        var job = queue.create(jobKey, { 
            title: 'fetch toko voucher getCategoryList'
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process(jobKey, async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Toko Voucher getCategoryList`)

            try {
                var url = `${ENDPOINT_URL_API.PRODUCT_CATEGORY_LIST_URL}?member_code=${memberCode}&signature=${signature}`
                var { data: { data: categories } } = await axios.get(url)
    
                resolve({
                    status: true,
                    data: categories
                })
            } catch ({ response: error }) {
                reject({
                    status:  false,
                    data: null
                })
            } finally {
                done()
            }
        })

        job.on('complete', function(result){
            Log.info('[JOB QUEUE IS COMPLETED]');
        }).on('failed attempt', function(errorMessage, doneAttempts){
            Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
        }).on('failed', function(errorMessage){
            Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
        }).on('progress', function(progress, data){
            Log.info('\r  job #' + job.id + ' ' + progress + '% complete with data ', data );
        })
    })
}

const getOperatorList = (memberCode, signature, id_category) => {
    return new Promise( async (resolve, reject) => {
        var jobKey = Helper.generateUuidV4()

        var job = queue.create(jobKey, { 
            title:'fetch toko voucher getOperatorList',
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process(jobKey, async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Toko Voucher getOperatorList`)

            try {
                var url = `${ENDPOINT_URL_API.PRODUCT_OPERATOR_LIST_URL}?member_code=${memberCode}&signature=${signature}&id=${id_category}`
                var { data: { data: operators } } = await axios.get(url)
    
                resolve({
                    status: true,
                    data: operators
                })
            } catch ({ response: { statusText }}) {
                reject({
                    status:  false,
                    data: statusText,
                })
            } finally {
                done()
            }
        })

        job.on('complete', function(result){
            Log.info('[JOB QUEUE IS COMPLETED]');
        }).on('failed attempt', function(errorMessage, doneAttempts){
            Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
        }).on('failed', function(errorMessage){
            Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
        }).on('progress', function(progress, data){
            Log.info('\r  job #' + job.id + ' ' + progress + '% complete with data ', data );
        })
    })
}

const getJenisList = (memberCode, signature, id_operator) => {
    return new Promise( async (resolve, reject) => {
        var jobKey = Helper.generateUuidV4()

        var job = queue.create(jobKey, { 
            title: 'fetch toko voucher getJenisList',
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process(jobKey, async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Toko Voucher getJenisList`)

            try {
                var url = `${ENDPOINT_URL_API.PRODUCT_JENIS_LIST_URL}?member_code=${memberCode}&signature=${signature}&id=${id_operator}`
                var { data: { data: operators } } = await axios.get(url)
    
                resolve({
                    status: true,
                    data: operators
                })
            } catch ({ response: { statusText }}) {
                reject({
                    status:  false,
                    data: statusText,
                })
            } finally {
                done()
            }
        })

        job.on('complete', function(result){
            Log.info('[JOB QUEUE IS COMPLETED]');
        }).on('failed attempt', function(errorMessage, doneAttempts){
            Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
        }).on('failed', function(errorMessage){
            Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
        }).on('progress', function(progress, data){
            Log.info('\r  job #' + job.id + ' ' + progress + '% complete with data ', data );
        })
    })
}

const getProductList = (memberCode, signature, id_jenis) => {
    return new Promise( async (resolve, reject) => {
        var jobKey = Helper.generateUuidV4()

        var job = queue.create(jobKey, { 
            title: 'fetch toko voucher getProductList',
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process(jobKey, async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Toko Voucher getProductList`)

            try {
                var url = `${ENDPOINT_URL_API.PRODUCT_LIST_URL}?member_code=${memberCode}&signature=${signature}&id_jenis=${id_jenis}`
                var { data: { data: operators } } = await axios.get(url)
    
                resolve({
                    status: true,
                    data: operators
                })

                done()
            } catch ({ response: { statusText }}) {
                reject({
                    status:  false,
                    data: statusText,
                })

                return done(new Error(statusText));
            }
        })

        job.on('complete', function(result){
            Log.info('[JOB QUEUE IS COMPLETED]');
        }).on('failed attempt', function(errorMessage, doneAttempts){
            Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
        }).on('failed', function(errorMessage){
            Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
        }).on('progress', function(progress, data){
            Log.info('\r  job #' + job.id + ' ' + progress + '% complete with data ', data );
        })
    })
}

const postTransactionTokovoucher = (memberCode, signature, trx_id, sku, tujuan) => {
    signature = crypto.createHash('md5').update(`${TOKOVOUCHER_MEMBER_CODE}:${TOKOVOUCHER_SECRET_KEY}:${trx_id}`).digest('hex'); // md5(MEMBER_CODE:SECRET:REF_ID)

    return new Promise( async (resolve, reject) => {
        var jobKey = Helper.generateUuidV4()

        var job = queue.create(jobKey, { 
            title: 'fetch toko voucher postTransactionTokovoucher',
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process(jobKey, async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Toko Voucher postTransactionTokovoucher`)

            try {
                var url = `${ENDPOINT_URL_API.PRODUCT_TRANSACTION}`
                var { data } = await axios.post(url, {
                    ref_id: trx_id,
                    produk: sku,
                    tujuan: tujuan,
                    member_code: memberCode,
                    signature: signature
                })
    
                Log.info('[*] Tokovoucher Hit API Response:', data)
                resolve({
                    status: true,
                    data: data?.status,
                    sn: data?.sn
                })

                done()
            } catch ({ response: { statusText }}) {
                reject({
                    status:  false,
                    data: statusText,
                })

                return done(new Error(statusText));
            }
        })

        job.on('complete', function(result){
            Log.info('[JOB QUEUE IS COMPLETED]');
        }).on('failed attempt', function(errorMessage, doneAttempts){
            Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
        }).on('failed', function(errorMessage){
            Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
        }).on('progress', function(progress, data){
            Log.info('\r  job #' + job.id + ' ' + progress + '% complete with data ', data );
        })
    })
}

const postTransactionStatus = (reff_id) => {
    return new Promise( async (resolve, reject) => {
        var jobKey = Helper.generateUuidV4()

        var job = queue.create(jobKey, { 
            title: 'fetch toko voucher getProductList',
        }).delay(4_000).save( function(err){
            if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
        })

        queue.process(jobKey, async (_, done) => {
            Log.info(`[JOB QUEUE IS PROCESS]: Fetch Toko Voucher getProductList`)

            try {
                var signature = generateSignature(TOKOVOUCHER_MEMBER_CODE, TOKOVOUCHER_SECRET_KEY, reff_id)
                var url = `${ENDPOINT_URL_API.PRODUCT_TRANSACTION_STATUS}`
                var { data } = await axios.post(url, {
                    ref_id: reff_id,
                    member_code: TOKOVOUCHER_MEMBER_CODE,
                    signature: signature
                })
    
                resolve({
                    status: true,
                    data: data
                })

                done()
            } catch ({ response: { statusText }}) {
                reject({
                    status:  false,
                    data: statusText,
                })

                return done(new Error(statusText));
            }
        })

        job.on('complete', function(result){
            Log.info('[JOB QUEUE IS COMPLETED]');
        }).on('failed attempt', function(errorMessage, doneAttempts){
            Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
        }).on('failed', function(errorMessage){
            Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
        }).on('progress', function(progress, data){
            Log.info('\r  job #' + job.id + ' ' + progress + '% complete with data ', data );
        })
    })
}

module.exports = {
    getCategoryList,
    getOperatorList,
    getJenisList,
    getProductList,
    postTransactionTokovoucher,
    postTransactionStatus,
}
