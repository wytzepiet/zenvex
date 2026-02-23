import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const gitConfig = {
  user: 'wytzepiet',
  repo: 'zenvex',
  branch: 'main',
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="font-[family-name:var(--font-serif)] text-lg italic">
          Zenvex
        </span>
      ),
    },
    links: [
      { text: 'Docs', url: '/docs' },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
