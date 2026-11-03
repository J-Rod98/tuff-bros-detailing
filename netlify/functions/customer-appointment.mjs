import {customerAppointment} from './lib/appointment-portal.mjs';
export default customerAppointment;
export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:60}};
