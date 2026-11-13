/**
 * The app lives under a sub-folder of the website (simonhannabuss.co.uk/tools).
 * Next.js adds this automatically to <Link>, redirect() and form actions;
 * use it yourself for plain <a href>, fetch/XHR URLs and cookie paths.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const withBase = (path: string) => `${BASE_PATH}${path}`;
