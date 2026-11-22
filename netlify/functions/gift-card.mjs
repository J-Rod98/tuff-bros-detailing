import {giftCard} from './lib/gift-card.mjs';
export default (request) => giftCard(request);
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:30}};
