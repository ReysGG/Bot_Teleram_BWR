export function smsCountryCallback(serviceId: number, countryId: number): string {
  return `sms_country:${serviceId}:${countryId}`;
}

export function smsConfirmCallback(
  serviceId: number,
  countryId: number,
  quantity: number,
): string {
  return `sms_confirm:${serviceId}:${countryId}:${quantity}`;
}

export function smsPurchaseCallback(
  serviceId: number,
  countryId: number,
  quantity: number,
): string {
  return quantity === 1
    ? `sms_purchase:${serviceId}:${countryId}`
    : `sms_purchase_bulk:${serviceId}:${countryId}:${quantity}`;
}
