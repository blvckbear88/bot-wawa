const path = require('node:path')

const { handler: UserHandler } = require(path.resolve('src/handler/user/user.handler.js'))
const { handler: ProductHandler } = require(path.resolve('src/handler/product/product.handler.js'))
const { handler: OrderHandler } = require(path.resolve('src/handler/order/order.handler.js'))
const { handler: CheckoutHandler } = require(path.resolve('src/handler/order/checkout.handler.js'))
const { handler: V2OrderHandler } = require(path.resolve('src/handler/order/v2order.handler.js'))
const { handler: TokoVoucherHandler } = require(path.resolve('src/handler/tokovoucher/tokovoucher.handler.js'))

module.exports = {
    UserHandler,
    ProductHandler,
    OrderHandler,
    CheckoutHandler,
    V2OrderHandler,
    TokoVoucherHandler
}