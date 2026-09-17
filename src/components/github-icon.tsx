import type { SVGProps } from 'react';

// The GitHub mark. lucide-react v1 removed brand icons, so this is vendored
// from the official Octicons "mark-github" icon (https://primer.style/foundations/icons).
export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.35-1.6-.92-2.16.28-.4.52-1.16.25-2.02 0 0-.67-.22-2.2.82-.6-.17-1.25-.25-1.9-.25s-1.3.08-1.9.25c-1.53-1.03-2.2-.82-2.2-.82-.27.86-.03 1.62.25 2.02-.57.56-.92 1.28-.92 2.16 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}
