import {customerQuote} from './lib/quote-portal.mjs';
export default customerQuote;
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:60}};
