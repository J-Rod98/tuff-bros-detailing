/**
 * Tuff Bros online-reservation rules.
 *
 * This module is intentionally the only public source for the standard-service
 * price estimates and routing decisions used by the booking page and functions.
 * A customer never receives a final price or a confirmed appointment from this
 * configuration.
 */

export const BOOKING_CONFIG = Object.freeze({
  businessName: 'Tuff Bros Mobile Detailing',
  timezone: 'America/Chicago',
  serviceAreaCities: [
    'North Little Rock',
    'Little Rock',
    'Sherwood',
    'Jacksonville',
    'Maumelle',
    'Cabot',
    'Conway',
    'Bryant',
    'Benton'
  ],
  scheduling: {
    minimumLeadDays: 1,
    bookingHorizonDays: 21,
    temporaryHoldHours: 24,
    // These are preferred arrival windows, never exact appointment promises.
    // Online requests are intentionally limited to mornings Monday–Saturday.
    windows: [
      { id: 'morning', label: 'Morning', detail: 'Preferred morning arrival' }
    ],
    requestableWeekdays: [1, 2, 3, 4, 5, 6]
  },
  reservation: {
    depositAmount: 25,
    depositTiming: 'after Tuff Bros approves the request',
    termsVersion: '2026-07-26'
  },
  vehicles: [
    { id: 'car', label: 'Car', description: 'Sedan, coupe, or hatchback' },
    { id: 'suv', label: 'SUV', description: 'Crossover or SUV' },
    { id: 'truck', label: 'Truck', description: 'Pickup truck' },
    { id: 'oversized', label: 'Van / Oversized', description: 'Van, lifted/dually truck, or another oversized vehicle' }
  ],
  services: [
    {
      id: 'quick-interior',
      name: 'Quick Interior Clean',
      prices: { car: 80, suv: 100, truck: 100 },
      duration: 'About 1–2 hours',
      bestFor: 'A regularly maintained interior that needs a clean reset.',
      includes: ['Vacuum', 'Wipe-down', 'Cupholders', 'Interior glass'],
      exclusions: ['Stains', 'Shampooing', 'Extraction', 'Heavy pet hair', 'Excessive sand'],
      maintenanceOnly: true
    },
    {
      id: 'basic-wash-wax',
      name: 'Basic Wash & Wax',
      prices: { car: 75, suv: 95, truck: 95 },
      duration: 'About 1–2 hours',
      bestFor: 'A well-kept exterior that needs a professional refresh.',
      includes: ['Hand wash', 'Wheels', 'Tires', 'Tire dressing', 'Exterior glass', 'Spray wax protection'],
      note: 'Spray wax is included. Traditional paste wax starts at $50.',
      maintenanceOnly: true
    },
    {
      id: 'basic-in-out',
      name: 'Basic In & Out',
      prices: { car: 150, suv: 180, truck: 180 },
      duration: 'About 2–3 hours',
      bestFor: 'A regularly maintained vehicle that needs inside-and-out care.',
      includes: ['Quick Interior Clean', 'Basic Wash & Wax'],
      note: 'This is a maintenance-level cleaning.',
      maintenanceOnly: true
    },
    {
      id: 'headlight-restoration',
      name: 'Headlight Restoration',
      prices: { car: 125, suv: 125, truck: 125 },
      duration: 'About 1–2 hours',
      bestFor: 'Cloudy or yellowed headlights that need an assessment first.',
      includes: ['Headlight condition review', 'Restoration estimate'],
      note: 'Standalone service starts at $125. Photos are required before approval.',
      requiresPhotos: true
    }
  ],
  quoteOnlyServices: [
    'Full Interior Detail',
    'Full Detail',
    'Ceramic Coating',
    'Paint Enhancement',
    'Paint Correction',
    'Odor Treatment',
    'Heavy Pet Hair',
    'Heavy Sand',
    'RV',
    'Boat',
    'Fleet',
    'Oversized vehicles',
    'Biohazard',
    'Mold',
    'Severe neglect'
  ],
  conditions: [
    { id: 'petHair', label: 'Pet hair?' },
    { id: 'heavySand', label: 'Heavy sand?' },
    { id: 'deepStains', label: 'Deep stains?' },
    { id: 'strongOdor', label: 'Strong odor?' },
    { id: 'smoke', label: 'Smoke?' },
    { id: 'mold', label: 'Mold?' },
    { id: 'biohazard', label: 'Biohazard?' },
    { id: 'largeTrash', label: 'Large amounts of trash?' },
    { id: 'sixMonths', label: 'Has it gone over six months without cleaning?' }
  ],
  addOns: [
    { id: 'pet-hair', label: 'Pet hair', price: 55 },
    { id: 'sand', label: 'Sand', price: 55 },
    {
      id: 'paste-wax',
      label: 'Traditional paste wax',
      price: 50,
      note: 'Starts at $50 and is reviewed before approval.',
      onlineEligible: true
    },
    {
      id: 'headlight-restoration',
      label: 'Headlight Restoration',
      price: 75,
      note: 'Starts at $75 when added to a standard service. Photos are required before approval.',
      requiresPhotos: true,
      onlineEligible: true
    }
  ],
  requiredPhotoTypes: [
    { id: 'front', label: 'Front of vehicle', required: true },
    { id: 'rear', label: 'Rear of vehicle', required: true },
    { id: 'frontSeats', label: 'Front seats', required: true },
    { id: 'rearSeats', label: 'Rear seats', required: true },
    { id: 'floor', label: 'Floor / carpets', required: true },
    { id: 'problemAreas', label: 'Problem areas', required: false }
  ]
});

export const BOOKING_STATUSES = Object.freeze({
  NEW_REQUEST: 'New Request',
  PENDING_REVIEW: 'Pending Review',
  PENDING_TRAVEL_REVIEW: 'Pending Travel Review',
  PENDING_PHOTO_REVIEW: 'Pending Photo Review',
  NEEDS_CUSTOMER_APPROVAL: 'Needs Customer Approval',
  CONFIRMED: 'Confirmed',
  RESCHEDULED: 'Rescheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DECLINED: 'Declined'
});

export function getService(serviceId) {
  return BOOKING_CONFIG.services.find((service) => service.id === serviceId) || null;
}

export function getVehicle(vehicleId) {
  return BOOKING_CONFIG.vehicles.find((vehicle) => vehicle.id === vehicleId) || null;
}

export function getAddOn(addOnId) {
  return BOOKING_CONFIG.addOns.find((addOn) => addOn.id === addOnId) || null;
}

export function getStartingPrice(serviceId, vehicleId) {
  const service = getService(serviceId);
  if (!service || vehicleId === 'oversized') return null;
  return service.prices[vehicleId] || null;
}

export function money(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

export function flaggedConditions(conditions = {}) {
  return BOOKING_CONFIG.conditions
    .filter((condition) => conditions[condition.id] === true)
    .map((condition) => condition.id);
}

/**
 * Calculates routing only. It deliberately never calculates or approves add-ons.
 */
export function evaluateReservation({ serviceId, vehicleId, conditions = {}, city, photoCount = 0, addOnIds = [] }) {
  const service = getService(serviceId);
  const selectedAddOns = addOnIds.map(getAddOn).filter(Boolean);
  const flags = flaggedConditions(conditions);
  const insideServiceArea = BOOKING_CONFIG.serviceAreaCities
    .some((allowedCity) => allowedCity.toLowerCase() === String(city || '').trim().toLowerCase());
  const reasons = [];
  let route = 'appointment_request';
  let initialStatus = BOOKING_STATUSES.PENDING_REVIEW;

  if (!service) {
    route = 'quote_request';
    initialStatus = BOOKING_STATUSES.PENDING_REVIEW;
    reasons.push('A custom service requires a quote.');
  }

  if (vehicleId === 'oversized') {
    route = 'quote_request';
    initialStatus = BOOKING_STATUSES.PENDING_REVIEW;
    reasons.push('Van and oversized vehicles require a pending quote.');
  }

  if (flags.length) {
    route = 'quote_request';
    initialStatus = BOOKING_STATUSES.PENDING_REVIEW;
    reasons.push('The reported vehicle condition needs a custom review.');
  }

  if ((service?.requiresPhotos || selectedAddOns.some((addOn) => addOn.requiresPhotos)) && photoCount < 1) {
    route = 'photo_review';
    initialStatus = BOOKING_STATUSES.PENDING_PHOTO_REVIEW;
    reasons.push('Headlight restoration needs photos before approval.');
  }

  if (!insideServiceArea && city) {
    initialStatus = BOOKING_STATUSES.PENDING_TRAVEL_REVIEW;
    reasons.push('Location requires travel review before confirmation.');
  }

  return {
    route,
    initialStatus,
    reasons,
    insideServiceArea,
    flaggedConditions: flags,
    selectedAddOns: selectedAddOns.map((addOn) => addOn.id),
    estimatedPrice: getStartingPrice(serviceId, vehicleId)
  };
}
