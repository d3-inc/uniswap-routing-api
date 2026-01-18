import { default as bunyan } from 'bunyan'

const targetLevel = (process.env.LOG_LEVEL === 'warn') ? 40 : 30;
const originalEmit = (bunyan.prototype as any)._emit;
(bunyan.prototype as any)._emit = function (rec: any, noemit: any) {
  if (rec.level < targetLevel) return;
  return originalEmit.call(this, rec, noemit);
};

import { setGlobalLogger } from '@baberswap/smart-order-router'
import { QuoteHandlerInjector } from './quote/injector'
import { QuoteHandler } from './quote/quote'

const log = bunyan.createLogger({
  name: 'Root',
  serializers: bunyan.stdSerializers,
  level: targetLevel,
})
setGlobalLogger(log);

let quoteHandler: QuoteHandler
try {
  const quoteInjectorPromise = new QuoteHandlerInjector('quoteInjector').build()
  quoteHandler = new QuoteHandler('quote', quoteInjectorPromise)
} catch (error) {
  log.fatal({ error }, 'Fatal error initialization')
  throw error
}

module.exports = {
  quoteHandler: quoteHandler.handler,
} 
