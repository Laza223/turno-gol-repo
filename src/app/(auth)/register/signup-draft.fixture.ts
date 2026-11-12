import type { SignupDraftData } from './signup-draft'

/** Borrador con todo menos el celular y la cuenta: lo que hay al llegar a la última pantalla. */
export const COMPLEX_ANSWERS: SignupDraftData = {
  complex: {
    name: 'Complejo San Martín',
    address: 'San Martin 850',
    city: 'Rosario',
    province: 'Santa Fe',
    latitude: -32.9473,
    longitude: -60.6368,
  },
  courts: { '5': 2 },
  schedule: { openHour: 8, closeHour: 0 },
  prices: { formats: [{ format: 5, count: 2, dayPrice: 6_000_000 }] },
  profile: { bookingIntake: 'whatsapp', hasFixedTeams: false, canteenEnabled: true },
}
