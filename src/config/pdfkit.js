const fs = require('node:fs')
const path = require('node:path')
const PDFDocument = require('pdfkit')

const { Helper } = require(path.resolve('src/helpers/index.js'))

function createInvoice(invoice, path) {
    let document = new PDFDocument({ size: 'A4', margin: 50 })

    generateHeader(document)
    generateCustomerInformation(document, invoice)
    generateInvoiceTable(document, invoice)
    generateFooter(document, invoice)

    document.end()
    document.pipe(fs.createWriteStream(path))
}

function generateHeader(document) {
    document
        .fillColor('#444444')
        .fontSize(20)
        .text('TOKO VOUCHER.', 50, 57)
        .fontSize(10)
        .text('TOKO VOUCHER.', 200, 50, { align: 'right' })
        .text('WhatsApp Bot', 200, 65, { align: 'right' })
        .text('Created By: aex-bot', 200, 80, { align: 'right' })
        .moveDown()
}

function generateCustomerInformation(document, invoice) {
    document
        .fillColor('#444444')
        .fontSize(20)
        .text('Invoice', 50, 160)
  
    generateHorizontalLine(document, 185)
  
    const customerInformationTop = 200;
  
    document
        .fontSize(10)
        .text('Invoice Number:', 50, customerInformationTop)
        .font('Helvetica-Bold')

        .text(invoice.invoice_nr, 150, customerInformationTop)
        .font('Helvetica')

        .text('Invoice Date:', 50, customerInformationTop + 15)

        .text(Helper.formattedDate(new Date()), 150, customerInformationTop + 15)

        .text('Balance Due:', 50, customerInformationTop + 30)

        .text(Helper.formattedCurrency(invoice.total), 150, customerInformationTop + 30)

        .text('Status:', 50, customerInformationTop + 45)

        .text(invoice.shipping.status, 150, customerInformationTop + 45)            
        .font('Helvetica-Bold')

        .text(invoice.shipping.name, 300, customerInformationTop)
        .font('Helvetica')

        .text(invoice.shipping.number, 300, customerInformationTop + 15)
        
        .moveDown()
  
    generateHorizontalLine(document, 272)
}

function generateInvoiceTable(document, invoice) {
    let i
    const invoiceTableTop = 330
  
    document.font('Helvetica-Bold')

    generateTableRow(document, invoiceTableTop, 'Item', 'Description', 'ID Tujuan', 'Unit Cost',  'Quantity', 'Line Total')

    generateHorizontalLine(document, invoiceTableTop + 20)

    document.font('Helvetica')
  
    for (i = 0; i < invoice.items.length; i++) {
        const item = invoice.items[i];
        const position = invoiceTableTop + (i + 1) * 35;

        generateTableRow(document, position, item.item, item.description,
            item.id_tujuan,
            Helper.formattedCurrency(item.amount / item.quantity),
            item.quantity,
            Helper.formattedCurrency(item.amount)
        )

        // generateHorizontalLine(document, position + 60)
    }
  
    generateHorizontalBreakLine(document, (invoiceTableTop + (i + 1) * 35))

    const subtotalPosition = invoiceTableTop + (i + 1) * 40

    generateTableRow(document, subtotalPosition, '', '', '', 'Subtotal', '',
        Helper.formattedCurrency(invoice.subtotal)
    )
  
    const paidToDatePosition = subtotalPosition + 20

    generateTableRow(document, paidToDatePosition, '',  '', '', 'Tax', '',
        invoice.tax
    )
  
    const duePosition = paidToDatePosition + 25

    document.font('Helvetica-Bold')

    generateTableRow(document, duePosition, '', '', '', 'Balance Due', '',
        Helper.formattedCurrency(invoice.total)
    )

    document.font('Helvetica')
}
  
function generateFooter(document, invoice) {
    var footer = invoice.footer_text || 'Payment is due within 15 minutes. Thank you for your order.'
    document
        .fontSize(10)
        .text(footer,50, 780,
        { align: 'center', width: 500 }
    )
}
  
function generateTableRow(document, y, item, description, id_tujuan, unitCost, quantity, lineTotal) {
    document
        .fontSize(10)
        .text(item, 50, y)
        .text(description, 120, y, { width: 90 })
        .text(id_tujuan, 225, y, { width: 75 })
        .text(unitCost, 280, y, { width: 90, align: 'right' })
        .text(quantity, 370, y, { width: 90, align: 'right' })
        .text(lineTotal, 0, y, { align: 'right' })
}
  
function generateHorizontalLine(document, y) {
    document
        .strokeColor('#aaaaaa')
        .lineWidth(1)
        .moveTo(50, y)
        .lineTo(550, y)
        .stroke()
}

function generateHorizontalBreakLine(document, y) {
    document
        .strokeColor('#aaaaaa')
        .lineWidth(1)
        .moveTo(50, y)
        .lineTo(550, y)
        .stroke()
}

module.exports = {
    createInvoice
}