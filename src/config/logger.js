const { createLogger, transports } = require('winston')

const logger = createLogger({
    transports: [
        new transports.File({
            filename: 'src/logs/debug.log',
            level: 'info'
        }),
        new transports.File({
            filename: 'src/logs/errors.log',
            level: 'error'
        })
    ],
    exitOnError: false
})

module.exports = {
    logger
}