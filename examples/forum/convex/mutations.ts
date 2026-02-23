import { v } from "convex/values";
import { mutation as baseMutation } from "./_generated/server";
import { mutation } from "./functions";

export const createThread = mutation({
  args: {
    title: v.string(),
    categoryId: v.id("categories"),
    authorId: v.id("users"),
    body: v.string(),
  },
  handler: async ({ zen }, { title, categoryId, authorId, body }) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const threadId = await zen.threads.insert({
      title,
      slug,
      categoryId,
      authorId,
      createdAt: Date.now(),
    });
    await zen.posts.insert({
      body,
      threadId,
      authorId,
    });
    return threadId;
  },
});

export const createPost = mutation({
  args: {
    body: v.string(),
    threadId: v.id("threads"),
    authorId: v.id("users"),
    parentId: v.optional(v.id("posts")),
  },
  handler: async ({ zen }, args) => {
    return zen.posts.insert(args);
  },
});

export const deleteThread = mutation({
  args: { id: v.id("threads") },
  handler: async ({ zen }, { id }) => {
    await zen.threads.delete(id);
  },
});

export const deletePost = mutation({
  args: { id: v.id("posts") },
  handler: async ({ zen }, { id }) => {
    await zen.posts.delete(id);
  },
});

export const toggleFollow = mutation({
  args: { followerId: v.id("users"), followeeId: v.id("users") },
  handler: async ({ zen }, { followerId, followeeId }) => {
    const existing = await zen.userFollows
      .byFollower(followerId)
      .findMany({ filter: (row) => row.followeeId === followeeId });

    if (existing.length > 0) {
      await zen.userFollows.delete(existing[0]._id);
      return false;
    } else {
      await zen.userFollows.insert({
        followerId,
        followeeId,
        followedAt: Date.now(),
      });
      return true;
    }
  },
});

export const clearData = baseMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "userFollows",
      "threadTags",
      "posts",
      "threads",
      "tags",
      "categories",
      "users",
    ] as const;
    for (const table of tables) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }
    return "cleared";
  },
});

export const seedData = mutation({
  args: {},
  handler: async ({ zen }) => {

    // --- Users ---
    const alice = await zen.users.insert({ name: "Alice Chen", email: "alice@example.com" });
    const bob = await zen.users.insert({ name: "Bob Smith", email: "bob@example.com" });
    const charlie = await zen.users.insert({ name: "Charlie Davis", email: "charlie@example.com" });
    const diana = await zen.users.insert({ name: "Diana Rivera", email: "diana@example.com" });
    const eve = await zen.users.insert({ name: "Eve Park", email: "eve@example.com" });
    const frank = await zen.users.insert({ name: "Frank Li", email: "frank@example.com" });

    // --- Categories ---
    const general = await zen.categories.insert({
      name: "General Discussion",
      description: "Talk about anything and everything",
    });
    const tech = await zen.categories.insert({
      name: "Technology",
      description: "Programming, frameworks, and tech news",
    });
    const design = await zen.categories.insert({
      name: "Design",
      description: "UI/UX, graphic design, and visual arts",
    });
    const meta = await zen.categories.insert({
      name: "Meta",
      description: "Forum feedback, suggestions, and announcements",
    });

    // --- Tags ---
    await zen.tags.insert({ name: "javascript" });
    await zen.tags.insert({ name: "typescript" });
    await zen.tags.insert({ name: "convex" });
    await zen.tags.insert({ name: "react" });
    await zen.tags.insert({ name: "ux" });

    const DAY = 86400000;
    const now = Date.now();

    // --- General threads (20) ---
    const users = [alice, bob, charlie, diana, eve, frank];
    const generalThreads: { title: string; slug: string; id?: any }[] = [
      { title: "Welcome to the Forum!", slug: "welcome-to-the-forum" },
      { title: "Introduce Yourself", slug: "introduce-yourself" },
      { title: "What Are You Reading?", slug: "what-are-you-reading" },
      { title: "Weekend Projects Thread", slug: "weekend-projects-thread" },
      { title: "AMA: Ask Me Anything", slug: "ama-ask-me-anything" },
      { title: "Favorite Podcasts?", slug: "favorite-podcasts" },
      { title: "Coffee vs Tea — The Eternal Debate", slug: "coffee-vs-tea" },
      { title: "Home Office Setup Show-off", slug: "home-office-setup" },
      { title: "Best Conferences to Attend in 2026", slug: "best-conferences-2026" },
      { title: "Side Hustle Ideas for Developers", slug: "side-hustle-ideas" },
      { title: "Unpopular Opinions Thread", slug: "unpopular-opinions" },
      { title: "Career Advice for Junior Devs", slug: "career-advice-juniors" },
      { title: "What's Your Dev Setup?", slug: "whats-your-dev-setup" },
      { title: "Remote Work Tips & Tricks", slug: "remote-work-tips" },
      { title: "Favorite Open Source Projects", slug: "favorite-open-source" },
      { title: "Music While Coding?", slug: "music-while-coding" },
      { title: "Learning New Languages in 2026", slug: "learning-new-languages" },
      { title: "Burnout Prevention Strategies", slug: "burnout-prevention" },
      { title: "Hackathon War Stories", slug: "hackathon-war-stories" },
      { title: "What Got You Into Programming?", slug: "what-got-you-into-programming" },
    ];
    for (let i = 0; i < generalThreads.length; i++) {
      const gt = generalThreads[i]!;
      gt.id = await zen.threads.insert({
        title: gt.title,
        slug: gt.slug,
        categoryId: general,
        authorId: users[i % users.length]!,
        createdAt: now - DAY * (20 - i),
      });
    }
    const t1 = generalThreads[0]!.id;
    const tIntro = generalThreads[1]!.id;
    const tBooks = generalThreads[2]!.id;
    const tWeekend = generalThreads[3]!.id;
    const tAma = generalThreads[4]!.id;

    // --- Tech threads ---
    const t2 = await zen.threads.insert({
      title: "TypeScript 5.9 Features",
      slug: "typescript-5-9-features",
      categoryId: tech,
      authorId: bob,
      createdAt: now - DAY * 10,
    });
    const t3 = await zen.threads.insert({
      title: "Building with Convex",
      slug: "building-with-convex",
      categoryId: tech,
      authorId: alice,
      createdAt: now - DAY * 7,
    });
    const t4 = await zen.threads.insert({
      title: "React 19 Discussion",
      slug: "react-19-discussion",
      categoryId: tech,
      authorId: charlie,
      createdAt: now - DAY * 5,
    });
    const tRust = await zen.threads.insert({
      title: "Rust vs Go for Backend Services",
      slug: "rust-vs-go-backend",
      categoryId: tech,
      authorId: frank,
      createdAt: now - DAY * 4,
    });
    const tAi = await zen.threads.insert({
      title: "AI-Assisted Coding: Hype or Game Changer?",
      slug: "ai-assisted-coding",
      categoryId: tech,
      authorId: eve,
      createdAt: now - DAY * 2,
    });
    const tEdge = await zen.threads.insert({
      title: "Edge Computing in 2026",
      slug: "edge-computing-2026",
      categoryId: tech,
      authorId: bob,
      createdAt: now - DAY * 1,
    });

    // --- Design threads ---
    const t5 = await zen.threads.insert({
      title: "Design Systems Best Practices",
      slug: "design-systems-best-practices",
      categoryId: design,
      authorId: diana,
      createdAt: now - DAY * 11,
    });
    const tFigma = await zen.threads.insert({
      title: "Figma Tips & Tricks",
      slug: "figma-tips-and-tricks",
      categoryId: design,
      authorId: eve,
      createdAt: now - DAY * 6,
    });
    const tA11y = await zen.threads.insert({
      title: "Accessibility: Where to Start?",
      slug: "accessibility-where-to-start",
      categoryId: design,
      authorId: alice,
      createdAt: now - DAY * 3,
    });
    const tAnim = await zen.threads.insert({
      title: "Animation Libraries Showdown",
      slug: "animation-libraries-showdown",
      categoryId: design,
      authorId: charlie,
      createdAt: now - DAY * 1,
    });

    // --- Meta threads ---
    const tRules = await zen.threads.insert({
      title: "Forum Rules & Guidelines",
      slug: "forum-rules-and-guidelines",
      categoryId: meta,
      authorId: alice,
      createdAt: now - DAY * 13,
    });
    const tFeatures = await zen.threads.insert({
      title: "Feature Requests",
      slug: "feature-requests",
      categoryId: meta,
      authorId: bob,
      createdAt: now - DAY * 9,
    });
    const tBugs = await zen.threads.insert({
      title: "Bug Reports",
      slug: "bug-reports",
      categoryId: meta,
      authorId: charlie,
      createdAt: now - DAY * 4,
    });

    // ===== Posts =====

    // "Welcome to the Forum!"
    const p1 = await zen.posts.insert({ body: "Hey everyone! Welcome to our new forum. Feel free to introduce yourselves and start discussions on any topic.", threadId: t1, authorId: alice });
    await zen.posts.insert({ body: "Thanks for setting this up, Alice! Excited to be here.", threadId: t1, authorId: bob, parentId: p1 });
    await zen.posts.insert({ body: "Great to see a new community forming. Looking forward to the discussions!", threadId: t1, authorId: charlie });
    await zen.posts.insert({ body: "Hello from the west coast! Glad to join.", threadId: t1, authorId: eve });

    // "Introduce Yourself"
    const pIntro1 = await zen.posts.insert({ body: "I'm Bob, a full-stack dev based in NYC. I mostly work with TypeScript and Convex. What about you all?", threadId: tIntro, authorId: bob });
    await zen.posts.insert({ body: "Diana here! I'm a designer turned developer. Love building things that look great and work well.", threadId: tIntro, authorId: diana, parentId: pIntro1 });
    await zen.posts.insert({ body: "Hey! I'm Eve, a backend engineer. Currently obsessed with Rust.", threadId: tIntro, authorId: eve });
    await zen.posts.insert({ body: "Frank here. DevOps by day, open source contributor by night.", threadId: tIntro, authorId: frank });
    await zen.posts.insert({ body: "Nice to meet everyone! I'm Charlie, mobile + web dev.", threadId: tIntro, authorId: charlie });

    // "What Are You Reading?"
    await zen.posts.insert({ body: "Just finished 'Designing Data-Intensive Applications' by Martin Kleppmann. Highly recommend it!", threadId: tBooks, authorId: eve });
    await zen.posts.insert({ body: "I'm re-reading 'The Pragmatic Programmer'. It holds up so well.", threadId: tBooks, authorId: bob });
    await zen.posts.insert({ body: "Currently reading 'Refactoring UI' — incredibly practical for developers who want to design better.", threadId: tBooks, authorId: diana });
    await zen.posts.insert({ body: "'Staff Engineer' by Will Larson is great if you're thinking about the IC track.", threadId: tBooks, authorId: frank });

    // "Weekend Projects Thread"
    const pWknd = await zen.posts.insert({ body: "Share your weekend projects here! I'm building a CLI tool for managing dotfiles.", threadId: tWeekend, authorId: charlie });
    await zen.posts.insert({ body: "Working on a recipe app with Convex. Real-time sync between devices is magic.", threadId: tWeekend, authorId: alice, parentId: pWknd });
    await zen.posts.insert({ body: "Trying to build a chess engine in Rust. It's harder than I thought!", threadId: tWeekend, authorId: eve });
    await zen.posts.insert({ body: "Contributing to an open source design system. Always more to do.", threadId: tWeekend, authorId: diana });

    // "AMA: Ask Me Anything"
    const pAma = await zen.posts.insert({ body: "I've been doing DevOps for 8 years. Ask me anything about CI/CD, containers, or infrastructure!", threadId: tAma, authorId: frank });
    await zen.posts.insert({ body: "What's your take on serverless vs containers for new projects?", threadId: tAma, authorId: bob, parentId: pAma });
    await zen.posts.insert({ body: "For most teams, I'd start serverless and move to containers when you hit its limits. The operational overhead of containers is real.", threadId: tAma, authorId: frank, parentId: pAma });
    await zen.posts.insert({ body: "How do you handle secrets management across environments?", threadId: tAma, authorId: alice });
    await zen.posts.insert({ body: "We use a combination of Vault and environment-specific config. Never commit secrets, always inject at runtime.", threadId: tAma, authorId: frank });

    // Posts for the remaining general threads (6-20)
    await zen.posts.insert({ body: "I love 'Syntax' for web dev news and 'Changelog' for open source. What are your go-to podcasts?", threadId: generalThreads[5]!.id, authorId: diana });
    await zen.posts.insert({ body: "ShopTalk Show is great for frontend stuff.", threadId: generalThreads[5]!.id, authorId: bob });

    await zen.posts.insert({ body: "Coffee, no contest. I need that caffeine hit to get into flow state.", threadId: generalThreads[6]!.id, authorId: frank });
    await zen.posts.insert({ body: "Tea all the way. Green tea gives me calm focus without the jitters.", threadId: generalThreads[6]!.id, authorId: eve });
    await zen.posts.insert({ body: "Why not both? Coffee in the morning, tea in the afternoon.", threadId: generalThreads[6]!.id, authorId: alice });

    await zen.posts.insert({ body: "Just got a standing desk and a 34-inch ultrawide. Game changer for productivity.", threadId: generalThreads[7]!.id, authorId: bob });
    await zen.posts.insert({ body: "I keep it minimal — MacBook, external keyboard, good chair. That's it.", threadId: generalThreads[7]!.id, authorId: charlie });

    await zen.posts.insert({ body: "React Summit and TypeScript Congress are both excellent. Anyone going this year?", threadId: generalThreads[8]!.id, authorId: alice });
    await zen.posts.insert({ body: "I really enjoyed Strange Loop before it ended. Looking for something similar.", threadId: generalThreads[8]!.id, authorId: frank });

    await zen.posts.insert({ body: "Building micro-SaaS products has been lucrative for me. Small tools that solve real problems.", threadId: generalThreads[9]!.id, authorId: eve });
    await zen.posts.insert({ body: "Technical writing / blogging can be surprisingly profitable with sponsorships.", threadId: generalThreads[9]!.id, authorId: diana });

    await zen.posts.insert({ body: "Tabs are better than spaces. There, I said it.", threadId: generalThreads[10]!.id, authorId: charlie });
    await zen.posts.insert({ body: "Most design patterns are over-engineering in disguise.", threadId: generalThreads[10]!.id, authorId: frank });
    await zen.posts.insert({ body: "Unit tests are often less valuable than integration tests.", threadId: generalThreads[10]!.id, authorId: bob });

    await zen.posts.insert({ body: "Build things! Side projects teach you more than any course. And don't be afraid to ask questions.", threadId: generalThreads[11]!.id, authorId: alice });
    await zen.posts.insert({ body: "Learn to read other people's code. Open source is the best classroom.", threadId: generalThreads[11]!.id, authorId: eve });

    await zen.posts.insert({ body: "Neovim + tmux on a tiling window manager. I rarely touch the mouse.", threadId: generalThreads[12]!.id, authorId: frank });
    await zen.posts.insert({ body: "VS Code with Vim keybindings. Best of both worlds.", threadId: generalThreads[12]!.id, authorId: bob });
    await zen.posts.insert({ body: "Cursor has been my daily driver lately. The AI integration is seamless.", threadId: generalThreads[12]!.id, authorId: alice });

    await zen.posts.insert({ body: "Set boundaries. Just because you CAN work from home 24/7 doesn't mean you should.", threadId: generalThreads[13]!.id, authorId: diana });
    await zen.posts.insert({ body: "Having a dedicated workspace, even a small one, makes a huge difference mentally.", threadId: generalThreads[13]!.id, authorId: charlie });

    await zen.posts.insert({ body: "Excalidraw is fantastic. Simple, collaborative, and it just works.", threadId: generalThreads[14]!.id, authorId: eve });
    await zen.posts.insert({ body: "I've been contributing to Biome (the Rust-based linter/formatter). Highly recommend checking it out.", threadId: generalThreads[14]!.id, authorId: frank });

    await zen.posts.insert({ body: "Lo-fi beats are the cliché answer but they genuinely work. No lyrics to distract.", threadId: generalThreads[15]!.id, authorId: bob });
    await zen.posts.insert({ body: "I need complete silence for hard problems, but music helps for repetitive tasks.", threadId: generalThreads[15]!.id, authorId: alice });

    await zen.posts.insert({ body: "I want to learn Zig this year. It feels like the next step after getting comfortable with Rust.", threadId: generalThreads[16]!.id, authorId: eve });
    await zen.posts.insert({ body: "Elixir has been on my list forever. The concurrency model is beautiful.", threadId: generalThreads[16]!.id, authorId: charlie });

    await zen.posts.insert({ body: "Take real vacations. Not 'working from the beach' — actual time off with no Slack.", threadId: generalThreads[17]!.id, authorId: diana });
    await zen.posts.insert({ body: "Exercise regularly. Even a 20-minute walk clears my head and prevents burnout.", threadId: generalThreads[17]!.id, authorId: frank });

    await zen.posts.insert({ body: "Our team built a working prototype of a drone delivery system in 48 hours. Sleep-deprived but worth it!", threadId: generalThreads[18]!.id, authorId: charlie });
    await zen.posts.insert({ body: "Best hackathon moment: our demo crashed on stage, we fixed it live, and won the crowd over.", threadId: generalThreads[18]!.id, authorId: bob });

    await zen.posts.insert({ body: "I got a TI-83 calculator in high school and started writing games on it. That was it for me.", threadId: generalThreads[19]!.id, authorId: alice });
    await zen.posts.insert({ body: "MySpace customization! Changing CSS on my profile page was my gateway drug.", threadId: generalThreads[19]!.id, authorId: diana });
    await zen.posts.insert({ body: "Minecraft redstone circuits. I was basically doing logic gates without knowing it.", threadId: generalThreads[19]!.id, authorId: eve });

    // "TypeScript 5.9 Features"
    const p4 = await zen.posts.insert({ body: "TypeScript 5.9 brings some amazing new features. The improved type inference for generic functions is a game changer. What are your favorite additions?", threadId: t2, authorId: bob });
    await zen.posts.insert({ body: "The satisfies operator improvements are my favorite. Makes pattern matching so much cleaner.", threadId: t2, authorId: alice, parentId: p4 });
    await zen.posts.insert({ body: "I'm really excited about the new decorator metadata API. It opens up so many possibilities for frameworks.", threadId: t2, authorId: diana });
    await zen.posts.insert({ body: "The config file improvements (extends array) saved me hours of config duplication.", threadId: t2, authorId: frank });
    await zen.posts.insert({ body: "Anyone tried the new --erasableSyntaxOnly flag? Great for ESM-first projects.", threadId: t2, authorId: eve });

    // "Building with Convex"
    const p7 = await zen.posts.insert({ body: "I've been building a real-time app with Convex and it's been an incredible experience. The automatic reactivity and type safety are unmatched.", threadId: t3, authorId: alice });
    await zen.posts.insert({ body: "Totally agree! The developer experience is fantastic. How are you handling relations in your schema?", threadId: t3, authorId: bob, parentId: p7 });
    await zen.posts.insert({ body: "We built Zenvex for exactly that purpose — type-safe relations on top of Convex!", threadId: t3, authorId: alice, parentId: p7 });
    await zen.posts.insert({ body: "That sounds really cool. Would love to see some examples of the API.", threadId: t3, authorId: charlie });
    await zen.posts.insert({ body: "The zero-config real-time is what sold me. No WebSocket setup, no caching layer — it just works.", threadId: t3, authorId: eve });
    await zen.posts.insert({ body: "How does it handle offline support? That's always been my concern with real-time databases.", threadId: t3, authorId: frank });

    // "React 19 Discussion"
    const pR19 = await zen.posts.insert({ body: "React 19 is finally stable! The new use() hook and Server Components are going to change how we build apps.", threadId: t4, authorId: charlie });
    await zen.posts.insert({ body: "The concurrent features are really maturing. Actions and transitions make form handling so much better.", threadId: t4, authorId: diana });
    await zen.posts.insert({ body: "use() is a game changer for data fetching patterns. No more useEffect waterfalls.", threadId: t4, authorId: alice, parentId: pR19 });
    await zen.posts.insert({ body: "Server Components feel like a paradigm shift. Need to rethink how I structure apps.", threadId: t4, authorId: bob });
    await zen.posts.insert({ body: "The new compiler (React Forget) is interesting but I'm waiting for it to mature a bit more.", threadId: t4, authorId: eve });

    // "Rust vs Go for Backend"
    const pRust = await zen.posts.insert({ body: "I've used both Rust and Go extensively for backend services. Let's discuss the tradeoffs!", threadId: tRust, authorId: frank });
    await zen.posts.insert({ body: "Go's simplicity wins for most CRUD apps. Rust shines when performance is critical.", threadId: tRust, authorId: eve, parentId: pRust });
    await zen.posts.insert({ body: "Go's goroutines make concurrency so easy compared to async Rust. But Rust catches more bugs at compile time.", threadId: tRust, authorId: bob });
    await zen.posts.insert({ body: "Don't sleep on Go's new range functions. The language keeps getting better.", threadId: tRust, authorId: charlie });

    // "AI-Assisted Coding"
    const pAi = await zen.posts.insert({ body: "I've been using AI coding assistants daily for 6 months now. My productivity has definitely increased, but I'm worried about skill atrophy. Thoughts?", threadId: tAi, authorId: eve });
    await zen.posts.insert({ body: "I think the key is using AI for boilerplate and repetitive tasks, but still understanding what the code does.", threadId: tAi, authorId: alice, parentId: pAi });
    await zen.posts.insert({ body: "It's changed how I think about coding. I spend more time on architecture and less on syntax.", threadId: tAi, authorId: bob });
    await zen.posts.insert({ body: "For learning new languages/frameworks, AI is incredible. It's like having a patient tutor.", threadId: tAi, authorId: diana });
    await zen.posts.insert({ body: "The danger is blindly accepting suggestions. Always review AI-generated code carefully.", threadId: tAi, authorId: frank });
    await zen.posts.insert({ body: "Hot take: AI will make code reviews MORE important, not less.", threadId: tAi, authorId: charlie });

    // "Edge Computing in 2026"
    await zen.posts.insert({ body: "Edge computing has come a long way. What platforms are you all using? I've been exploring Cloudflare Workers and Deno Deploy.", threadId: tEdge, authorId: bob });
    await zen.posts.insert({ body: "Vercel's edge functions have been solid for us. The cold start times are negligible.", threadId: tEdge, authorId: alice });
    await zen.posts.insert({ body: "I think the real win is edge databases. Having data close to users changes everything.", threadId: tEdge, authorId: frank });

    // "Design Systems Best Practices"
    const pDS = await zen.posts.insert({ body: "What are the key principles you follow when building a design system? I'd love to hear different approaches.", threadId: t5, authorId: diana });
    await zen.posts.insert({ body: "Consistency is key. I always start with tokens — colors, spacing, typography — before building components.", threadId: t5, authorId: alice, parentId: pDS });
    await zen.posts.insert({ body: "Document everything from day one. A design system nobody understands is useless.", threadId: t5, authorId: eve });
    await zen.posts.insert({ body: "Start small. You don't need 50 components — start with the ones you use in 80% of screens.", threadId: t5, authorId: bob });
    await zen.posts.insert({ body: "Versioning is crucial once multiple teams depend on it. Semantic versioning for component libraries saved us.", threadId: t5, authorId: frank });

    // "Figma Tips & Tricks"
    await zen.posts.insert({ body: "Share your favorite Figma workflow tips! I'll start: Auto Layout with min/max width changed my component game.", threadId: tFigma, authorId: eve });
    await zen.posts.insert({ body: "Variables + Modes for theming is amazing. Dark mode in one click.", threadId: tFigma, authorId: diana });
    await zen.posts.insert({ body: "The Dev Mode improvements have made design-to-code handoff so much smoother.", threadId: tFigma, authorId: alice });

    // "Accessibility: Where to Start?"
    const pA11y = await zen.posts.insert({ body: "I want to improve accessibility in my projects but feel overwhelmed. Where should a developer start?", threadId: tA11y, authorId: alice });
    await zen.posts.insert({ body: "Start with semantic HTML. That alone fixes like 50% of accessibility issues.", threadId: tA11y, authorId: diana, parentId: pA11y });
    await zen.posts.insert({ body: "Install axe-core as a dev tool. It catches the obvious issues automatically.", threadId: tA11y, authorId: bob });
    await zen.posts.insert({ body: "Try navigating your own app with just a keyboard. You'll find issues immediately.", threadId: tA11y, authorId: eve });
    await zen.posts.insert({ body: "WCAG 2.2 guidelines are the reference, but don't try to learn it all at once.", threadId: tA11y, authorId: frank });

    // "Animation Libraries Showdown"
    await zen.posts.insert({ body: "Framer Motion vs GSAP vs CSS-only animations — what's your pick and why?", threadId: tAnim, authorId: charlie });
    await zen.posts.insert({ body: "Framer Motion for React apps. The layout animations are unmatched.", threadId: tAnim, authorId: diana });
    await zen.posts.insert({ body: "CSS animations cover 90% of use cases. Only reach for a library when you need complex orchestration.", threadId: tAnim, authorId: bob });

    // "Forum Rules & Guidelines"
    await zen.posts.insert({ body: "Please keep discussions respectful and constructive. Here are the basic ground rules for our community...", threadId: tRules, authorId: alice });
    await zen.posts.insert({ body: "Thanks for laying these out. Clear rules help everyone.", threadId: tRules, authorId: bob });

    // "Feature Requests"
    const pFR = await zen.posts.insert({ body: "Drop your feature requests here! What would make this forum better?", threadId: tFeatures, authorId: bob });
    await zen.posts.insert({ body: "Markdown support in posts would be amazing.", threadId: tFeatures, authorId: charlie, parentId: pFR });
    await zen.posts.insert({ body: "Search functionality across all threads.", threadId: tFeatures, authorId: alice });
    await zen.posts.insert({ body: "Email notifications when someone replies to your post.", threadId: tFeatures, authorId: diana });
    await zen.posts.insert({ body: "Dark mode toggle! (Please)", threadId: tFeatures, authorId: eve });

    // "Bug Reports"
    await zen.posts.insert({ body: "Found any bugs? Report them here with steps to reproduce.", threadId: tBugs, authorId: charlie });
    await zen.posts.insert({ body: "The thread count badge sometimes shows stale numbers after deleting threads.", threadId: tBugs, authorId: frank });
    await zen.posts.insert({ body: "Long post bodies don't wrap properly on mobile.", threadId: tBugs, authorId: eve });

    // --- User follows ---
    await zen.userFollows.insert({ followerId: alice, followeeId: bob, followedAt: now - DAY * 10 });
    await zen.userFollows.insert({ followerId: alice, followeeId: diana, followedAt: now - DAY * 8 });
    await zen.userFollows.insert({ followerId: bob, followeeId: alice, followedAt: now - DAY * 9 });
    await zen.userFollows.insert({ followerId: bob, followeeId: eve, followedAt: now - DAY * 5 });
    await zen.userFollows.insert({ followerId: charlie, followeeId: alice, followedAt: now - DAY * 7 });
    await zen.userFollows.insert({ followerId: charlie, followeeId: bob, followedAt: now - DAY * 6 });
    await zen.userFollows.insert({ followerId: diana, followeeId: alice, followedAt: now - DAY * 4 });
    await zen.userFollows.insert({ followerId: diana, followeeId: eve, followedAt: now - DAY * 3 });
    await zen.userFollows.insert({ followerId: eve, followeeId: frank, followedAt: now - DAY * 2 });
    await zen.userFollows.insert({ followerId: frank, followeeId: alice, followedAt: now - DAY * 1 });
    await zen.userFollows.insert({ followerId: frank, followeeId: bob, followedAt: now - DAY * 1 });

    return "seeded";
  },
});
