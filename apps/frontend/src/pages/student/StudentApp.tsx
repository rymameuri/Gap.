import { BookOpen } from 'lucide-react';

export function StudentApp() {
  return (
    <main className="student-foundation">
      <a className="student-brand" href="/">gap.</a>
      <p className="student-meta">Student workspace / Sara Ahmed</p>
      <h1>My courses</h1>
      <article className="student-course">
        <BookOpen aria-hidden="true" size={28} />
        <p className="student-meta">PHYS 101 / Section A</p>
        <h2>Introduction to Physics</h2>
        <p>Forces and motion, energy and work, and electric circuits.</p>
      </article>
      <p className="student-meta">Demo course</p>
    </main>
  );
}
