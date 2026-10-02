import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'UnNEET: find your next step',
    short_name: 'UnNEET',
    description: 'Find a job, apprenticeship, course or support, all in one place.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf9f4',
    theme_color: '#101a33',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
