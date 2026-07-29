import { jobberGraphql } from './jobber-client.mjs';

function mutationResult(data, key) {
  const result = data?.[key];
  if (!result) throw new Error('Jobber did not return the expected booking response.');
  const messages = (result.userErrors || []).map((error) => error.message).filter(Boolean);
  if (messages.length) throw new Error(messages.join(' '));
  return result;
}

function firstLine(value, maximum = 180) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, maximum);
}

function addressForJobber(address) {
  return {
    street1: firstLine(address.street, 120),
    city: firstLine(address.city === 'Other' ? '' : address.city, 80),
    province: 'AR',
    country: 'US',
    postalCode: String(address.zip || '').trim()
  };
}

async function findExistingClient(phone) {
  const data = await jobberGraphql(`
    query FindBookingClient($phone: String!) {
      clients(first: 5, searchTerm: $phone, searchFields: [PHONES]) {
        nodes { id }
      }
    }
  `, { phone });
  return data.clients?.nodes?.[0] || null;
}

export async function findOrCreateBookingClient({ customer, address }) {
  const existing = await findExistingClient(customer.phone);
  if (existing) return { id: existing.id, created: false };

  const emails = customer.email
    ? [{ description: 'MAIN', primary: true, address: customer.email }]
    : [];
  const data = await jobberGraphql(`
    mutation CreateBookingClient($input: ClientCreateInput!) {
      clientCreate(input: $input) {
        client { id }
        userErrors { message path }
      }
    }
  `, {
    input: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      // A booking request is not marketing consent. Tuff Bros can record any
      // separate messaging consent in Jobber before sending non-transactional SMS.
      phones: [{ description: 'MAIN', primary: true, smsAllowed: false, number: customer.phone }],
      emails,
      properties: [{ name: 'Mobile detailing service address', address: addressForJobber(address) }]
    }
  });
  const result = mutationResult(data, 'clientCreate');
  if (!result.client?.id) throw new Error('Jobber could not create the customer record.');
  return { id: result.client.id, created: true };
}

export async function createJobberBookingRequest({ clientId, title, instructions }) {
  const data = await jobberGraphql(`
    mutation CreateBookingRequest($input: RequestCreateInput!) {
      requestCreate(input: $input) {
        request { id jobberWebUri title }
        userErrors { message path }
      }
    }
  `, {
    input: {
      clientId,
      title: firstLine(title, 250),
      assessment: { instructions: String(instructions || '').slice(0, 7_000) }
    }
  });
  const result = mutationResult(data, 'requestCreate');
  if (!result.request?.id) throw new Error('Jobber could not create the appointment request.');
  return result.request;
}

export async function addBookingNote({ requestId, message, pinned = true }) {
  const data = await jobberGraphql(`
    mutation AddBookingNote($requestId: EncodedId!, $input: RequestCreateNoteInput!) {
      requestCreateNote(requestId: $requestId, input: $input) {
        userErrors { message path }
      }
    }
  `, { requestId, input: { message: String(message).slice(0, 8_000), pinned } });
  mutationResult(data, 'requestCreateNote');
}
