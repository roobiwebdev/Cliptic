<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# You have to follow these rules when you build this app. Every single rule must be followed.

- You are building this app with a pattern recognition model. That means that anything you write is based on previous patterns and coding practices already used in the app. Never create your own architecture, use your own libraries, or create new patterns without confirming similar patterns don't already exist in the app.

- This app is built with a "SOURCE OF TRUTH" GLOBAL architecture across the entire app. That means everything already follows a GLOBAL pattern or should follow one as much as possible. The architecture of the entire app is already established, and you should be building things into that only. The architecture of the app should be modular. That means adding things in the future should be as simple as just plugging stuff in. I don't want things to be tightly coupled. but SOURCE OF TRUTH is the most important architectural strategy in this app. Most of the code you write should be globalized as much as possible. but you also need to be very careful here. DONT create blindly. You have to know if something that can facilate your work already exists or not. and only if you cannot find an architecture that can support this new feature, only then you should create new stuff. For example configuration, redux architeccure, layer modular coding practices (Similar to what was followed in the TRPC procedures) where each layer acts as an independant task. Switching tech stacks or business logic, or strategies should be simple and easy to implment.

- For components, forms, endpoints or anything that takes input, please use ZOD schemas EVERY SINGLY TIME, and react hook forms according to shadcn ui https://ui.shadcn.com/docs/forms/react-hook-form#approach this ensures that data curroption can never happen.

- For all services you HAVE to use import 'server-only' on top of the file. Not using this means customers can invoke this function directly and bypas security. When importing them into a router you should use import \* that way we will get object references.

- Production grade Typescript should ALWAYS be used. Follow these rules: You should NEVER ever use "any" type or unknown types or hardcode types. This is a production grade application. ALWAYS use prisma types ONLY if the type you require is related to our prisma schem or our database (already existing Prisma types) If not then you can move to the next stage (We're doing this because we want to prioritze saving context). If the type is a custom type, then you can check type files (All custom types will be in the lib/types folder) to search if it already exists and only create a type if its not there, and is going to be the source of truth and can be reused. You need to follow production grade typescript support using SOURCE OF TRUTH TYPESCRIPT ARCHITECTURE only! NEVER write types anywhere other than the lib/types folder.

- This is a production-grade codebase. You should never create scripts, create Prisma scripts or seed files or probe tester files or anything that cannot be pushed to production. You will need my permission before you create these script files that perform manual actions. Always keep the code in this codebase production-grade.

- Pattern-recognition rules for this codebase. You need to follow these at all times so that way you can build this project with 0 context polution and without hitting sessions limits. the entire codebase is built with a `SOURCE OF TRUTH KEYWORDS` line at the top of its file. Before creating a type, function, or constant — grep the codebase for it by searching similar keywords to help catch stuff earlier. If you still can't find it then you can search the codebase as usual this is done to limit context consumption. If it exists and you found it through the grep, follow instructions correctly. If you must create something new, add a `SOURCE OF TRUTH KEYWORDS` line so the next agent finds it and can understand how things work.

- NEVER NEVER EVER create duplicate types, code, functions, components etc because grep felt like work.

- Because typescript is already being used heavily in the app, you need to run a typescript check EVERYTIME you handover something to prove that your codebase is clean. Using unknown, undefined, hardcoded types, or typescript bypasses are strictly prohbitted. so NEVER report a false positive.

- The codebase has the following starting point architecture.

1. Protected Procedure, which are the HEART of the app. EVERY important router endpoint SHOULD and HAS to use this protected procedure. The feature gates are implmeneted here automatically server side as well so no need to check. This procedure does a TON of heavy lifting already. Just follow the instructions as required (The typescript should help identify what is needed). Again build the app with patterns in the app.

2. Routers: This is the router that will use the protecter procedure. It should have Business logic (validation, orchestration, decisions etc) REMEMBER the protected procedure already does a bunch of business logic like feature gate checks, usage check , permissions and authorizations checks, etc. So in here only do business logic that is connected to the current task.

3. Service layer. This is the layer that only directly contacts the database. MAKE SURE the file has import "server only" on top of the file. if not this will violate security guidelines.

4. Remember any permission required

**Never create `middleware.ts`.** The framework reads `proxy.ts` instead.

Inline Comment context injection is the most important part of your development process. It helps other AI devs grep the codebase and also understand each block / function of code through the SOT keywords. You have to write inline comments above the function or block followinng this format.

```
/**
 * SOURCE OF TRUTH KEYWORDS: Symbol1, Symbol2, TypeA ( add about 10 keywords. this will help with the SOurce of truth keyword search method)
 * WHAT:  Describes what this block of function is
 * WHY:   Why this is needed here and why we are doing the following.
 * WHERE: Where it is being used.
 */
```

write inline comments as well to help us undertand what's going on but keep this minimal. and don't just explain the code it should be outcome based.

You should use barrel exports whenever possible with possible exporting as one object whenever possible.

IMPORTANT, you should NEVER skip or leave a feature incomplete. If there are incomplete pieces that you forgot while building the feature or you left it out because the user never said so, you need to tell them about those outliers or complete them. 

When building the UI of this application, you must follow these rules strictly:

- Before creating any component, always check whether a reusable component already exists and use it whenever possible.
- Every component should be designed with reusability in mind. NEVER hardcode logic, layouts, or data directly into components.
- If a component is reusable across multiple routes or features, it must be treated as a global component and placed inside:
  components/global/COMPONENT_NAME_FOLDER
- If a component is only used within a single route, place it inside:
  THE_ROUTE/\_components
- Do not create duplicate components with similar functionality. Extend or compose existing components whenever possible. If you see yourself reading from a pattern of another component, and you think it can be globalized, globalize it. But global means it absolutely can be reused whenever possible with custom options as well like slots. So for example a table component. A table component has a ton of reusable logic, like search, paginations, filters etc. but then custom slots will be needed for things like CREATE, delete or custom views. So similarly make sure global components have this capabaility as well. Fewer the lines of code the better. and don't forget to strictly enforce our inline comment injection strategy into the codebase.
- Global components should remain flexible, configurable, and production-ready so they can scale across the application and HAS to use production grade typescript as much as possible.
- If you're creting a new component, always follow similar design themes from the application if its a simple component. if it's a cmplex component, you HAVE TO ask the user to paste the link of a shadcn ui block component if they have one. and use this as a reference. Make sure to rename to component to follow our folder structure and naming convention and if needed globalize it.

IMPORTANT, when you import shadcn ui components or blocks, sometimes they will have outdated copy that doent follow the branding of this app. Please make sure you fix those.

NEVER hardcode theme colors (no hex, `text-white`, `bg-[#...]`, or forced `dark` classes). Always use the theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-primary`, `border`, etc.) so everything follows the app theme.