// Single source of truth for business data used across the site.

const phone = '+52 55 1113 2539';
const phoneDigits = phone.replace(/\D/g, ''); // 525511132539

export const site = {
  name: 'Body Work Gym & Fitness',
  phone,
  /** tel: link, no spaces */
  phoneHref: `tel:+${phoneDigits}`,
  whatsappUrl: `https://wa.me/${phoneDigits}?text=${encodeURIComponent('Hola, me gustaría información sobre Body Work Gym.')}`,
  // Dirección exacta
  address: 'Av. de los Reyes 2, Centro Urbano, 54700 Cuautitlán Izcalli, Méx.',
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Body Work Gym & Fitness Cuautitlán Izcalli')}`,
  // Horario oficial.
  schedule: 'Lunes a Viernes de 4:30 a.m. a 10:30 p.m. Sábados de 7:00 a.m. a 3:00 p.m. Domingos de 9:00 a.m. a 1:00 p.m.',
} as const;

export type Site = typeof site;
