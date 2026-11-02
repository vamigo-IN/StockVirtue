import Link from 'next/link';
import { Container } from '@/components/news/blocks';
import { newsPath } from '@/news/routes';

export default function NewsNotFound() {
  return (
    <Container className="py-20 text-center">
      <p className="font-mono text-sm tracking-[0.14em] text-primary uppercase">
        404 · Not found
      </p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
        We couldn’t find that story
      </h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        It may have been moved or taken down, or the address may be mistyped.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={newsPath.home()}
          className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Top stories
        </Link>
        <Link
          href={newsPath.search()}
          className="rounded-lg border border-border px-5 py-2.5 font-semibold hover:bg-muted"
        >
          Search the news
        </Link>
      </div>
    </Container>
  );
}
