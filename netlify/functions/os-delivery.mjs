import {retryDelivery} from './lib/os-delivery.mjs';
export default async()=>{await retryDelivery();};
export const config={schedule:'* * * * *'};
