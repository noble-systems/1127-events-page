/**
 * ============================================================================
 * 1127 EVENTS: CENTRAL CONTENT CONFIG
 * ============================================================================
 *
 * Everything a non-developer needs to edit lives in this file: copy, event
 * details, dates, links, contact info, and the photography shot list.
 *
 * HOW TO ADD REAL PHOTOGRAPHY
 *   1. Drop image files into /public/media/ (e.g. /public/media/pool-01.jpg)
 *   2. Set `image: "/media/pool-01.jpg"` on any media slot below.
 *   3. That's it. The designed placeholder is replaced by an optimized
 *      next/image with the same crop and caption removed.
 *
 * HOW TO ANNOUNCE A DATE
 *   Replace `date: DATE_TBA` on an event with e.g. `date: "Saturday, May 16"`.
 *   Anything left as DATE_TBA renders as "Dates Announcing Soon".
 *
 * PLACEHOLDERS
 *   Values set to `null` render as clearly-marked, non-clickable placeholder
 *   chips so nothing on the page is ever a broken link. Fill them in and they
 *   become real links automatically.
 * ============================================================================
 */

import type { EventRecord, MediaTone } from "@/lib/types";

export type { MediaTone };

export const DATE_TBA = "Dates Announcing Soon";

/**
 * Version of the terms, privacy and cookie policies. Stored against every
 * submission so you can tell which wording someone actually agreed to.
 * Bump it whenever any of the three documents changes materially, and update
 * the "Last updated" date on those pages to match.
 */
export const LEGAL_VERSION = "2026-07-29";

/* -------------------------------------------------------------------------- */
/* Brand                                                                       */
/* -------------------------------------------------------------------------- */

export const brand = {
  name: "1127 Events",
  shortName: "1127",
  numerals: "1127",
  city: "Scottsdale, Arizona",
  region: "Old Town Scottsdale, Arizona",
  domain: "https://1127.events", // inferred from the team email addresses; confirm before launch
  description:
    "1127 Events is an Arizona event-production company. We create and produce curated event concepts, starting with Sun Club, a poolside house-music series in Old Town Scottsdale. We bring the audience, marketing, media and technical production behind every date.",
  shortDescription:
    "Arizona event production. Audience, marketing, media and technical production behind every date.",
} as const;

/* -------------------------------------------------------------------------- */
/* Contact + social. Set to null until confirmed                              */
/* -------------------------------------------------------------------------- */

export const contact = {
  email: "hello@1127.events" as string | null,
  /** e.g. "@1127events" */
  instagramHandle: null as string | null,
  /** e.g. "https://instagram.com/1127events" */
  instagramUrl: null as string | null,
  /** e.g. "(480) 555-0123" */
  phone: null as string | null,
  /**
   * Full postal address, shown in the footer of every marketing email.
   * US commercial email rules require a valid physical address in the message,
   * so leaving this null is a launch blocker rather than a nicety.
   * e.g. "1127 Events, 4400 N Scottsdale Rd, Scottsdale, AZ 85251"
   */
  postalAddress: "1127 Events, 6850 E McDowell Rd #4400, Scottsdale, AZ 85257" as
    string | null,
} as const;

/* -------------------------------------------------------------------------- */
/* Text messaging programme                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Entering a phone number is the opt-in. There is no separate tick box, so this
 * sentence is the entire consent record: it has to be on screen, next to the
 * field, before anyone submits.
 *
 * Every clause here is load-bearing. Carriers check for the programme
 * description, the frequency note, the rates note and the STOP/HELP keywords
 * during A2P 10DLC review, and a flow missing them is a common rejection.
 *
 * Two rules for whoever edits this:
 *   1. Change it here only. The forms, the privacy policy and the registration
 *      all quote this constant, and they have to stay in step.
 *   2. If the programme starts sending something this sentence does not
 *      describe (sponsor promotions, say), the sentence changes first and
 *      LEGAL_VERSION gets bumped. Widening what you send under old wording is
 *      the thing that causes trouble.
 */
export const smsProgram = {
  disclosure:
    "Adding your number opts you in to text messages from 1127 Events about new and upcoming dates. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for help. Texts are not a condition of entry, so leave this blank if you would rather not get them.",
  /** Where people opt in. A2P registration asks for this URL. */
  optInUrl: "/rsvp",
} as const;

/* -------------------------------------------------------------------------- */
/* Who gets notified when a form is submitted                                  */
/* -------------------------------------------------------------------------- */

/**
 * Internal recipients for form notifications. Each list can be overridden per
 * environment with the matching variable in .env, which is useful for pointing
 * staging at a test inbox. These are the defaults the app ships with.
 *
 * Email only sends when SES is configured; see DEPLOY.md → RSVP email.
 */
const TEAM = [
  "daniel@1127.events",
  "taylor@1127.events",
  "ethan@1127.events",
] as const;

export const notifications = {
  /** Override: RSVP_NOTIFY_ADDRESS. Set to [] to stop RSVP alerts. */
  rsvp: TEAM as readonly string[],
  /** Override: AMBASSADOR_NOTIFY_ADDRESS */
  ambassador: TEAM as readonly string[],
  /** Override: TALENT_NOTIFY_ADDRESS */
  talent: TEAM as readonly string[],
  /** Override: PARTNER_NOTIFY_ADDRESS. Nobody is alerted until this is filled in. */
  partner: [] as readonly string[],
} as const;

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

export const navLinks = [
  { label: "Events", href: "#events" },
  { label: "Ambassadors", href: "#ambassadors" },
  { label: "Opportunities", href: "/opportunities" },
  { label: "Partner With Us", href: "/partner" },
] as const;

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export const hero = {
  eyebrow: "1127 Events Presents",
  title: "Sun Club",
  tagline: "House music under the desert sun.",
  body: "A curated poolside series bringing together hometown DJs, Scottsdale sunshine, thoughtful production, and the people who make the city move.",
  location: "Old Town Scottsdale, Arizona",
  date: DATE_TBA,
  primaryCta: { label: "Explore Sun Club", href: "#sun-club" },
  secondaryCta: { label: "Partner With 1127", href: "/partner" },
  /** Swap for a real hero still or poster frame: "/media/hero.jpg" */
  image: null as string | null,
  imageAlt: "Poolside at golden hour in Old Town Scottsdale",
  shotNote: "Hero: wide poolside frame, late afternoon light",
} as const;

/* -------------------------------------------------------------------------- */
/* Facts strip. Only verified facts belong here                               */
/* -------------------------------------------------------------------------- */

export const facts = [
  { value: "~30 yrs", label: "Combined team experience" },
  { value: "In-house", label: "Sound, power & audio tech" },
  { value: "House", label: "Music direction" },
  { value: "Old Town", label: "Scottsdale, Arizona" },
] as const;

/* -------------------------------------------------------------------------- */
/* Events. Reusable cards; add new concepts to this array.                    */
/* -------------------------------------------------------------------------- */

/**
 * Launch content for the events list.
 *
 * These are seeds, not the source of truth. Once the app is connected to
 * DynamoDB the admin dashboard owns events; this array is imported once on first
 * use, and is what the public page falls back to if the store is unreachable.
 * the store imports automatically the first time it is used.
 */
export const seedEvents: EventRecord[] = [
  {
    id: "sun-club",
    name: "Sun Club",
    series: "1127 Events",
    tagline: "House music under the desert sun.",
    summary:
      "A poolside house series in Old Town Scottsdale. Hometown DJs, water you're meant to get into, and a room that builds from afternoon into golden hour.",
    status: "Featured series",
    date: DATE_TBA,
    location: "Old Town Scottsdale, Arizona",
    venue: null,
    tags: ["House music", "Poolside", "Day into golden hour"],
    tone: "dusk",
    featured: true,
    published: true,
    order: 0,
    shotNote: "Sun Club: crowd at the water's edge, afternoon",
    image: null,
    imageAlt: "Guests dancing poolside at a Sun Club event",
    ctaLabel: "RSVP for Sun Club",
    ctaAction: "rsvp",
    emailSubject: null,
    emailHeading: null,
    emailBody: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "in-development",
    name: "More concepts in development",
    series: "1127 Events",
    tagline: "Sun Club is the first series, not the last.",
    summary:
      "1127 builds event concepts around music, community and production. If you run a venue or brand with a room worth filling, the next one can start with a conversation.",
    status: "In development",
    date: "To be announced",
    location: "Arizona",
    venue: null,
    tags: ["New formats", "Venue partnerships"],
    tone: "ink",
    featured: false,
    published: true,
    order: 1,
    shotNote: "Production: load-in, sound check, empty room",
    image: null,
    imageAlt: "1127 production team during load-in",
    ctaLabel: "Start a Conversation",
    ctaAction: "partner",
    emailSubject: null,
    emailHeading: null,
    emailBody: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Sun Club introduction                                                       */
/* -------------------------------------------------------------------------- */

export const sunClub = {
  eyebrow: "The Series",
  title: "A different kind of Scottsdale pool party.",
  paragraphs: [
    "Sun Club sits somewhere between a Mediterranean beach club and a long afternoon with your favorite people. House music from open to close, programmed to move with the light instead of peaking in the first hour.",
    "Get in the water. Get back out. Order something cold, find your group, stay through golden hour. It's put together properly, from sound and lighting to hosting, without the door attitude or the table minimum standing between you and the music.",
  ],
  details: [
    { label: "Music", value: "House, all day, programmed to build" },
    { label: "Setting", value: "Poolside, Old Town Scottsdale" },
    { label: "Talent", value: "Hometown DJs and popular local artists" },
    { label: "Arc", value: "Afternoon into golden hour" },
    { label: "Dress", value: "Resort wear and good swimwear" },
    { label: "Energy", value: "Social, warm, unpretentious" },
  ],
  shotNote: "Guests socializing, pool in frame, mid-afternoon",
  image: null as string | null,
  imageAlt: "Friends socializing at the edge of the pool",
} as const;

/* -------------------------------------------------------------------------- */
/* What 1127 brings. Order matters: audience first, equipment last           */
/* -------------------------------------------------------------------------- */

export type Capability = {
  id: string;
  index: string;
  title: string;
  lead: string;
  body: string;
  points: readonly string[];
  tone: MediaTone;
};

export const capabilities: readonly Capability[] = [
  {
    id: "audience",
    index: "01",
    title: "Audience development",
    lead: "We do not expect the venue to fill the event for us.",
    body: "Every date runs on months of relationship work rather than a flyer and hope. We build the room through the networks that actually move people in this city, and we know who is coming before the doors open.",
    points: [
      "Scottsdale and Phoenix nightlife networks",
      "Hospitality and lifestyle communities",
      "Hometown DJs and their followings",
      "Community connectors and ambassadors",
      "Targeted RSVP campaigns",
      "Returning-guest outreach",
    ],
    tone: "cobalt",
  },
  {
    id: "marketing",
    index: "02",
    title: "Marketing investment",
    lead: "Substantial paid marketing support behind every event.",
    body: "Each date carries a real advertising and promotional budget, not just organic posts. We produce the creative, buy the placements, collect the RSVPs, and keep the audience for the next one.",
    points: [
      "Paid social advertising",
      "Targeted local campaigns",
      "Professionally produced creative",
      "DJ and partner cross-promotion",
      "RSVP and email collection",
      "Retargeting for future dates",
    ],
    tone: "golden",
  },
  {
    id: "ambassadors",
    index: "03",
    title: "Ambassador network",
    lead: "A curated, tracked network of local tastemakers.",
    body: "Socially connected people across nightlife, hospitality, fashion, fitness, beauty and young-professional circles who bring real groups and real content. Organized and accountable, not a comp list.",
    points: [
      "Pre-event promotion",
      "Socially relevant groups on the day",
      "Authentic event-day content",
      "New local audiences each date",
    ],
    tone: "terracotta",
  },
  {
    id: "djs",
    index: "04",
    title: "Local DJ network",
    lead: "Hometown artists who already have the room.",
    body: "We book experienced local talent with established community relationships, chosen for musical quality and fit rather than a name on a poster. They promote the date, they show up early, and the programming develops across the day.",
    points: [
      "Recognizable Phoenix and Scottsdale artists",
      "Established community relationships",
      "Professional, reliable, easy to work with",
      "Music that builds with the afternoon",
    ],
    tone: "ink",
  },
  {
    id: "media",
    index: "05",
    title: "Professional media",
    lead: "The event ends. The exposure does not.",
    body: "Every date is covered like a campaign. Venue partners keep the assets and get tagged across the distribution, long after the last record.",
    points: [
      "Event photography and video",
      "Short-form vertical content",
      "Crowd, DJ and venue coverage",
      "Edited recaps",
      "Multi-account distribution",
      "Reusable assets for venue partners",
    ],
    tone: "pool",
  },
  {
    id: "team",
    index: "06",
    title: "Experienced production team",
    lead: "Roughly 30 years of combined event-production experience.",
    body: "Our team's background spans planning, venue coordination, live production, audio, artist management, marketing and event-day operations. When something needs solving at four in the afternoon, someone on site has solved it before.",
    points: [
      "Event planning and venue coordination",
      "Live production and audio deployment",
      "Artist management",
      "Marketing and crowd development",
      "Event-day operations",
      "Technical troubleshooting",
    ],
    tone: "sand",
  },
  {
    id: "production",
    index: "07",
    title: "In-house technical production",
    lead: "One team. One plan. Fewer moving parts for the venue.",
    body: "A coordinated technical package instead of four unrelated vendors and a group chat. We arrive with the system, the technician and the power, and we handle it from load-in to strike.",
    points: [
      "Professional in-house sound system",
      "DJ equipment and changeovers",
      "Dedicated audio technician",
      "Setup, tuning and live support",
      "Independent mobile production power",
      "Load-in and breakdown coordination",
    ],
    tone: "dusk",
  },
];

/* -------------------------------------------------------------------------- */
/* Ambassador program                                                          */
/* -------------------------------------------------------------------------- */

export const ambassadors = {
  eyebrow: "Sun Club Ambassador Program",
  title: "The people who move the city.",
  intro:
    "Sun Club works with a curated network of local ambassadors who bring more than follower counts. They bring real relationships, real communities, and the kind of organic energy that turns an event into the place everyone wants to be.",
  doTitle: "What ambassadors do",
  does: [
    "Promote the date ahead of the event",
    "Bring socially relevant groups",
    "Create authentic event-day content",
    "Introduce Sun Club to new local circles",
    "Help build a recurring community around the series",
  ],
  forTitle: "Who it's for",
  communities: [
    "Nightlife",
    "Hospitality",
    "Fashion",
    "Fitness",
    "Beauty & lifestyle",
    "College & young professional",
  ],
  benefitsTitle: "What you get",
  benefits: [
    "Complimentary or priority event access",
    "Guest-list opportunities for your group",
    "Professional photography and social content",
    "Access to future Sun Club dates",
    "Performance-based event incentives",
    "A direct line into Scottsdale's music, nightlife and hospitality communities",
  ],
  cta: "Apply to Become an Ambassador",
  shotNote: "Ambassadors: group portrait, natural light",
  image: null as string | null,
  imageAlt: "A group of Sun Club ambassadors poolside",
} as const;

/* -------------------------------------------------------------------------- */
/* Opportunities: /opportunities                                              */
/* -------------------------------------------------------------------------- */

export const opportunities = {
  eyebrow: "Work With 1127",
  title: "We're always looking for people who make the day better.",
  intro:
    "1127 books per event, not per season. If you're an artist, a technician, a promoter or someone who just knows how to run a room, tell us what you do. We come back to this list every time a date gets confirmed.",
  roles: [
    {
      name: "DJs",
      body: "Hometown artists who know the Phoenix and Scottsdale floor. We program across the whole day, so opening and afternoon slots are real slots, not filler.",
    },
    {
      name: "Audio technicians",
      body: "System setup and tuning, changeovers, and live support through the day. We run our own rig and our own power.",
    },
    {
      name: "Promoters & street team",
      body: "People with genuine reach into a community. Paid per date, tracked properly, not a comp list.",
    },
    {
      name: "Photo & video",
      body: "Event coverage and short-form vertical. Fast turnarounds matter more than gear lists.",
    },
    {
      name: "Event staff & hospitality",
      body: "Hosting, check-in, guest list and the hundred small things that make a day feel handled.",
    },
    {
      name: "Production crew",
      body: "Load-in, staging, power and breakdown. Reliable beats experienced, though both is better.",
    },
  ],
  shotNote: "Crew at work: sound check before doors",
  image: null as string | null,
  imageAlt: "The 1127 crew during sound check",
} as const;

/* -------------------------------------------------------------------------- */
/* Media grid. Doubles as the shot list for the photo team               */
/* -------------------------------------------------------------------------- */

export type MediaSlot = {
  id: string;
  shotNote: string;
  tone: MediaTone;
  image: string | null;
  imageAlt: string;
  /** Layout span in the editorial grid. */
  span: "wide" | "tall" | "square" | "standard" | "full";
  badge?: string;
};

export const mediaSection = {
  eyebrow: "Media & Coverage",
  title: "Built to be experienced. Designed to be shared.",
  intro:
    "Every date is shot and edited like a campaign: crowd, artists, venue and details. Partners keep the assets and appear across the distribution.",
} as const;

/**
 * These slots double as the shot list for the photo team. Order controls the
 * editorial grid; the spans below tile cleanly into full rows.
 */
export const mediaSlots: readonly MediaSlot[] = [
  {
    id: "crowd",
    shotNote: "Poolside crowd, mid-afternoon",
    tone: "pool",
    image: null,
    imageAlt: "A crowd dancing beside the pool in the afternoon",
    span: "wide",
  },
  {
    id: "dj",
    shotNote: "DJ performing, booth in frame",
    tone: "ink",
    image: null,
    imageAlt: "A DJ performing at a Sun Club event",
    span: "tall",
  },
  {
    id: "friends",
    shotNote: "Friends socializing at the water's edge",
    tone: "golden",
    image: null,
    imageAlt: "Friends talking at the edge of the pool",
    span: "square",
  },
  {
    id: "venue",
    shotNote: "Venue detail: architecture, shade, texture",
    tone: "sand",
    image: null,
    imageAlt: "Architectural detail of the venue",
    span: "square",
  },
  {
    id: "drinks",
    shotNote: "Drinks in direct sunlight",
    tone: "terracotta",
    image: null,
    imageAlt: "Cold drinks catching the afternoon sun",
    span: "square",
  },
  {
    id: "golden-hour",
    shotNote: "Golden hour on the deck",
    tone: "dusk",
    image: null,
    imageAlt: "Golden hour light across the pool deck",
    span: "standard",
  },
  {
    id: "production",
    shotNote: "Behind the scenes: load-in and sound check",
    tone: "ink",
    image: null,
    imageAlt: "The production team during sound check",
    span: "standard",
  },
  {
    id: "recap",
    shotNote: "Recap video, 60-second edit",
    tone: "dusk",
    image: null,
    imageAlt: "Thumbnail for the event recap video",
    span: "full",
    badge: "Recap film",
  },
];

/* -------------------------------------------------------------------------- */
/* Partner section                                                             */
/* -------------------------------------------------------------------------- */

export const partner = {
  eyebrow: "Venues, Brands & Partners",
  title: "Bring 1127 to your venue.",
  intro:
    "You focus on hospitality, bar service, security and your guests. We handle entertainment, audience development, event marketing, technical production and media, all through one point of contact.",
  brings: [
    { title: "Audience strategy", body: "Built and tracked before the date." },
    { title: "Paid promotion", body: "Real budget, produced creative." },
    { title: "Local talent", body: "Artists this city already turns out for." },
    { title: "Media production", body: "Photo, video and recaps you keep." },
    { title: "Event operations", body: "Staffing, run-of-show, day-of control." },
    { title: "Technical production", body: "Sound, power and an audio tech." },
    { title: "One point of contact", body: "From first call to load-out." },
  ],
  cta: "Start a Conversation",
  inquiryTypes: [
    "Venue",
    "Brand or sponsor",
    "DJ or artist",
    "Vendor",
    "Media",
    "Other",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Final CTA                                                                   */
/* -------------------------------------------------------------------------- */

export const finalCta = {
  guests: {
    eyebrow: "For guests",
    title: "Join the next event",
    body: "Get on the Sun Club list and hear about the date before it's public.",
    cta: "RSVP for Sun Club",
  },
  partners: {
    eyebrow: "For venues, brands & artists",
    title: "Create something with 1127",
    body: "Tell us about your room, your brand or your project and we'll come back with a plan.",
    cta: "Start a Conversation",
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Footer                                                                      */
/* -------------------------------------------------------------------------- */

export const footer = {
  blurb:
    "Event production and curated event concepts, made in Arizona. Sun Club is a 1127 Events series.",
  columns: [
    {
      title: "Events",
      links: [
        { label: "Upcoming events", href: "/#events" },
        { label: "RSVP for Sun Club", href: "/rsvp" },
        { label: "Sun Club", href: "/#sun-club" },
      ],
    },
    {
      title: "Work with us",
      links: [
        { label: "Opportunities", href: "/opportunities" },
        { label: "Ambassador application", href: "/opportunities#ambassador" },
        { label: "Partnership inquiry", href: "/partner" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy policy", href: "/privacy" },
        { label: "Cookie policy", href: "/cookies" },
        { label: "Terms and conditions", href: "/terms" },
      ],
    },
  ],
} as const;
