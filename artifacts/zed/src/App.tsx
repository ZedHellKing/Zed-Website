import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import { useForm } from 'react-hook-form';
import {
  Activity, ArrowLeft, ArrowUpLeft, Bot as BotIcon, Check, ChevronLeft, CircleHelp,
  Heart, Home, LoaderCircle, LogOut, MessageCircle, MessageSquare, Plus, Radio, Send, Settings2,
  ShieldCheck, Sparkles, UserRound, Users, X, Zap
} from 'lucide-react';
import {
  useGetDashboard, getGetDashboardQueryKey, useListBots, getListBotsQueryKey, useCreateBot,
  useUpdateBot, useDeleteBot, useRunBotAction, useListBotLogs, getListBotLogsQueryKey,
  useGetProfile, getGetProfileQueryKey, useUpdateProfile, useSearchUsers, getSearchUsersQueryKey,
  useListFeed, getListFeedQueryKey, useCreatePost, useTogglePostLike, useListConversations,
  getListConversationsQueryKey, useCreateConversation, useListMessages, getListMessagesQueryKey,
  useSendMessage
} from '@workspace/api-client-react';
import type { Bot, BotLog, Conversation, FeedPost, PublicProfile } from '@workspace/api-client-react';
import { BotPackageUpload } from '@/components/BotPackageUpload';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const appearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#ee3c69', colorForeground: '#e5e7ed', colorMutedForeground: '#9399aa',
    colorDanger: '#e4545b', colorBackground: '#171820', colorInput: '#20222c',
    colorInputForeground: '#e5e7ed', colorNeutral: '#373946', fontFamily: 'Vazirmatn, sans-serif', borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#171820] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#30313c]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#f1f1f6] font-bold', headerSubtitle: 'text-[#a2a5b1]', socialButtonsBlockButtonText: 'text-[#e7e8ed] font-semibold',
    formFieldLabel: 'text-[#dadbe2]', footerActionLink: 'text-[#ff5a83] font-semibold', footerActionText: 'text-[#a2a5b1]',
    dividerText: 'text-[#9296a4]', identityPreviewEditButton: 'text-[#ff5a83]', formFieldSuccessText: 'text-[#6fdbbc]',
    alertText: 'text-[#e9a0a8]', logoBox: 'mx-auto', logoImage: 'max-h-11', socialButtonsBlockButton: 'border-[#393b49] bg-[#20222c] hover:bg-[#282a36]',
    formButtonPrimary: 'bg-[#ed3d6a] hover:bg-[#fa4c77] text-white', formFieldInput: 'bg-[#20222c] border-[#393b49] text-[#f0f1f5]',
    footerAction: 'text-[#a2a5b1]', dividerLine: 'bg-[#393b49]', alert: 'bg-[#2b2027] border-[#57313b]',
    otpCodeFieldInput: 'bg-[#20222c] border-[#393b49] text-[#f0f1f5]', formFieldRow: 'text-[#dadbe2]', main: 'text-[#e5e7ed]',
  },
};

function ClerkCacheSync() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) client.clear();
    previous.current = id;
  }), [addListener, client]);
  return null;
}

function ClerkRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'مرحباً بعودتك', subtitle: 'سجّل الدخول إلى مجتمع زِد' } },
      signUp: { start: { title: 'ابدأ رحلتك مع زِد', subtitle: 'أنشئ حسابك وانضم إلى مجتمعنا' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}>
      <ClerkCacheSync />
      <Switch>
        <Route path="/" component={WelcomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/dashboard" component={DashboardRoute} />
        <Route path="/bots" component={BotsRoute} />
        <Route path="/bots/:botId" component={BotConsoleRoute} />
        <Route path="/community" component={CommunityRoute} />
        <Route path="/messages" component={MessagesRoute} />
        <Route path="/messages/:username" component={MessagesRoute} />
        <Route path="/profile" component={ProfileRoute} />
        <Route component={NotFound} />
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}

function WelcomeRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <WelcomeLoading />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Welcome />;
}

function SignInPage() {
  return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
}
function SignUpPage() {
  return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;
}
function AuthFrame({ children }: { children: ReactNode }) {
  return <div dir="rtl" className="auth-bg noise min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12">
    <Brand compact /><div className="mt-8 w-full">{children}</div><Link href="/" data-testid="link-auth-home" className="mt-6 text-sm text-muted-foreground hover:text-foreground">العودة للرئيسية</Link>
  </div>;
}
function WelcomeLoading() {
  return <main dir="rtl" className="min-h-[100dvh] grid place-items-center"><div className="w-40 h-2 rounded-full bg-primary/20 overflow-hidden"><div className="h-full w-1/2 bg-primary animate-pulse" /></div></main>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" data-testid="link-brand-home" className={`brand-lockup inline-flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
    <span className={`zed-wordmark font-bold leading-none ${compact ? 'text-[36px]' : 'text-[48px]'}`}>Zed</span>
    <ShurikenMark className={`shuriken text-primary ${compact ? 'h-6 w-6' : 'h-8 w-8'}`} />
    {!compact && <span className="signature text-[9px] text-muted-foreground self-end mb-1">HELLKING</span>}
  </Link>;
}
function ShurikenMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16 1.8 19.3 11l9-5.3-5.3 9 9.2 3.3-9.2 3.2 5.3 9-9-5.2-3.3 9.2-3.2-9.2-9 5.2 5.2-9L0 18l9-3.3-5.2-9 9 5.3L16 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <circle cx="16" cy="17" r="2.2" fill="currentColor"/>
  </svg>;
}

function Welcome() {
  return <main dir="rtl" className="welcome-page noise min-h-[100dvh] overflow-hidden">
    <header className="welcome-nav">
      <Brand />
      <nav className="flex items-center gap-2">
        <Link href="/sign-in" data-testid="link-welcome-signin" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">تسجيل الدخول</Link>
        <Link href="/sign-up" data-testid="link-welcome-signup" className="button-primary rounded-xl px-5 py-2.5 text-sm font-bold">انضم إلى زِد</Link>
      </nav>
    </header>
    <section className="welcome-hero">
      <div className="hero-copy fade-up">
        <div className="eyebrow"><span className="eyebrow-dot" /> مجتمع صُنّاع التجارب الذكية</div>
        <h1>أصدقاؤك.<br /><span className="zed-wordmark">Botsك.</span><br />كلهم في مكان.</h1>
        <p>مساحة واحدة تجمع مجتمعك، محادثاتك، ومساحات عمل بوتات ماسنجر — ضمن وضع المحاكاة، إلى أن تصبح بيانات Meta والعامل الدائم جاهزين.</p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/sign-up" data-testid="link-hero-join" className="button-primary rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2">ابدأ مع زِد <ArrowLeft size={17} /></Link>
          <Link href="/sign-in" data-testid="link-hero-login" className="button-outline rounded-xl px-6 py-3 font-semibold">لديك حساب؟</Link>
        </div>
        <div className="hero-proof"><div className="proof-avatars"><i>ن</i><i>ر</i><i>م</i><i>+</i></div><span>مجتمع ينمو مع كل محادثة</span></div>
      </div>
      <div className="hero-art fade-up delay-2">
        <div className="art-orbit orbit-a" /><div className="art-orbit orbit-b" />
        <img src="/assets/zed-supremecells.webp" alt="مقاتل زِد يتحرك وسط طاقة قرمزية" className="art-image" data-testid="img-welcome-art" />
        <div className="art-caption"><span className="live-pip" /> زِد — وضع المجتمع <span className="caption-divider" /> ٠١ / ٠٣</div>
        <div className="art-card art-card-top"><span className="art-card-icon"><MessageCircle size={16}/></span><div><strong>المجتمع يتحرك</strong><small>مساحات أكثر، ضجيج أقل</small></div></div>
        <div className="art-card art-card-bottom"><span className="status-bars"><b/><b/><b/><b/></span><div><strong>كل شيء تحت السيطرة</strong><small>تجربة محاكاة واضحة وآمنة</small></div></div>
        <div className="hero-signature">HELLKING <span>— ZED</span></div>
      </div>
    </section>
    <section className="welcome-strip">
      <div><span className="strip-index">01</span><strong>اعرفهم باسمهم</strong><small>ملفات شخصية وأسماء مستخدمين</small></div>
      <div><span className="strip-index">02</span><strong>ابقَ على تواصل</strong><small>منشورات ورسائل مباشرة</small></div>
      <div><span className="strip-index">03</span><strong>جرّب بأمان</strong><small>مساحات بوتات موسومة بالمحاكاة</small></div>
      <div className="strip-signoff">PLAY NICE.<br /><span>BUILD BOLD.</span></div>
    </section>
    <footer className="welcome-footer"><Brand compact /><span>مجتمع زِد — مساحة للناس الذين يبنون</span><span className="signature">HELLKING</span></footer>
  </main>;
}

function Guard({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <PageSkeleton />;
  return isSignedIn ? <>{children}</> : <Redirect to="/" />;
}
function DashboardRoute() { return <Guard><Dashboard/></Guard>; }
function BotsRoute() { return <Guard><BotsPage/></Guard>; }
function BotConsoleRoute() { return <Guard><BotConsole/></Guard>; }
function CommunityRoute() { return <Guard><Community/></Guard>; }
function MessagesRoute() { return <Guard><Messages/></Guard>; }
function ProfileRoute() { return <Guard><ProfileSettings/></Guard>; }
function Shell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const nav = [
    { href: '/dashboard', label: 'نظرة عامة', icon: Home },
    { href: '/bots', label: 'مساحات البوت', icon: BotIcon },
    { href: '/community', label: 'المجتمع', icon: Users },
    { href: '/messages', label: 'الرسائل', icon: MessageSquare },
    { href: '/profile', label: 'ملفي الشخصي', icon: UserRound },
  ];
  return <Guard><div dir="rtl" className="app-shell noise min-h-[100dvh]">
    <aside className="sidebar">
      <div className="sidebar-brand"><Brand compact /><span className="sidebar-edition">SUPREME / COMMUNITY</span></div>
      <div className="nav-label">مساحتك</div>
      <nav className="side-nav" aria-label="التنقل الرئيسي">
        {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`nav-${href.slice(1)}`} className={`nav-link ${location === href ? 'active' : ''}`}><Icon size={18} strokeWidth={1.8}/><span>{label}</span>{href === '/messages' && <span className="nav-indicator"/>}</Link>)}
      </nav>
      <div className="side-spacer" />
      <div className="simulation-card"><div className="sim-card-icon"><ShieldCheck size={17}/></div><div><b>وضع المحاكاة</b><p>كل العمليات تجريبية حالياً</p></div><span className="sim-pill">آمن</span></div>
      <button onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-signout" className="logout-link"><LogOut size={17}/> تسجيل الخروج</button>
      <div className="sidebar-footer"><span className="signature">HELLKING</span><span>v0.1 • زِد</span></div>
    </aside>
    <main className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>زِد</span><ChevronLeft size={13}/><strong>{title}</strong></div>
        <div className="topbar-actions"><span className="system-status"><i/> جميع الأنظمة هادئة</span><Link href="/profile" data-testid="link-top-profile" className="top-avatar"><Avatar><AvatarImage src={user?.imageUrl}/><AvatarFallback>{user?.firstName?.[0] || 'Z'}</AvatarFallback></Avatar></Link></div>
      </header>
      <div className="page-content">
        <div className="page-heading"><div><div className="page-kicker">ZED / {title.toUpperCase()}</div><h1 data-testid="text-page-title">{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>
        {children}
      </div>
      <footer className="mobile-footer"><Brand compact/><span className="signature">HELLKING</span></footer>
    </main>
  </div></Guard>;
}

function PageSkeleton() {
  return <div dir="rtl" className="min-h-[100dvh] p-8 bg-background"><div className="skeleton-bar w-52 h-8"/><div className="skeleton-grid mt-10"><div className="skeleton-block"/><div className="skeleton-block"/><div className="skeleton-block"/></div></div>;
}
function ErrorState({ retry }: { retry: () => void }) {
  return <div className="state-panel" data-testid="state-error"><CircleHelp size={23}/><b>لم نتمكن من تحميل هذه المساحة</b><span>تحقق من الاتصال وحاول مرة أخرى.</span><Button variant="outline" onClick={retry} data-testid="button-retry">إعادة المحاولة</Button></div>;
}
function EmptyState({ icon: Icon = Sparkles, title, text }: { icon?: typeof Sparkles; title: string; text: string }) {
  return <div className="state-panel" data-testid="state-empty"><span className="empty-icon"><Icon size={22}/></span><b>{title}</b><span>{text}</span></div>;
}
function Metric({ label, value, note, icon: Icon, accent = 'pink' }: { label: string; value: string | number; note: string; icon: typeof Activity; accent?: string }) {
  return <Card className={`metric-card accent-${accent}`}><CardContent className="p-5"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17}/></span></div><div className="metric-number" data-testid={`metric-${label}`}>{value}</div><div className="metric-note">{note}</div></CardContent></Card>;
}
function RelativeTime({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>الآن</span>;
  return <span>{new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}</span>;
}
function UserAvatar({ person, size = 'md' }: { person?: Partial<PublicProfile> | null; size?: 'sm' | 'md' | 'lg' }) {
  const display = person?.displayName || person?.username || 'عضو زِد';
  return <Avatar className={`user-avatar avatar-${size}`} data-testid={`avatar-${person?.username || 'member'}`}><AvatarImage src={person?.avatarUrl || undefined}/><AvatarFallback>{display.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>;
}

function Dashboard() {
  const summary = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const bots = useListBots({ query: { queryKey: getListBotsQueryKey() } });
  const feed = useListFeed({ query: { queryKey: getListFeedQueryKey() } });
  const profile = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });
  return <Shell title="نظرة عامة" subtitle="صباحٌ جميل لبناء شيء يستحق المشاركة.">
    {summary.isLoading ? <PageSkeleton/> : summary.isError ? <ErrorState retry={() => summary.refetch()}/> : <>
      <section className="welcome-banner fade-up">
        <div><div className="banner-kicker"><span/> أهلاً بك في زِد</div><h2>مساحتك، <span>{profile.data?.displayName || 'صانع التجربة'}</span>.</h2><p>كل شيء متصل. خذ نفساً، وتفقّد ما يحدث حولك.</p></div>
        <div className="banner-stamp"><span className="stamp-spark"><Sparkles size={23}/></span><span>STAY<br/>SHARP</span></div>
        <div className="banner-watermark">Z</div>
      </section>
      <section className="metric-grid fade-up delay-1">
        <Metric label="مساحات البوت" value={summary.data?.botCount ?? 0} note="تحت إدارتك" icon={BotIcon}/>
        <Metric label="قيد التشغيل" value={summary.data?.runningCount ?? 0} note="في وضع المحاكاة" icon={Radio} accent="cyan"/>
        <Metric label="منشورات المجتمع" value={summary.data?.communityPostCount ?? 0} note="أفكار يتشاركها الأعضاء" icon={MessageCircle} accent="violet"/>
      </section>
      <div className="dashboard-columns fade-up delay-2">
        <section className="section-card"><div className="section-title"><div><span className="section-overline">مساحاتك</span><h2>بوتات ماسنجر</h2></div><Link href="/bots" data-testid="link-dashboard-bots" className="text-link">عرض الكل <ArrowLeft size={14}/></Link></div>
          {bots.isLoading ? <LoadingRows/> : bots.isError ? <ErrorState retry={() => bots.refetch()}/> : bots.data?.length ? <div className="mini-bot-list">{bots.data.slice(0,4).map(bot => <BotRow key={bot.id} bot={bot}/>)}</div> : <EmptyState icon={BotIcon} title="ابدأ بمساحة بوت" text="أنشئ مساحة تجريبية لإدارة إعدادات بوتاتك."/>}
        </section>
        <section className="section-card activity-section"><div className="section-title"><div><span className="section-overline">من حولك</span><h2>نبض المجتمع</h2></div><Link href="/community" data-testid="link-dashboard-feed" className="text-link">المجتمع <ArrowLeft size={14}/></Link></div>
          {feed.isLoading ? <LoadingRows/> : feed.isError ? <ErrorState retry={() => feed.refetch()}/> : feed.data?.slice(0,3).map(post => <div className="activity-row" key={post.id} data-testid={`activity-post-${post.id}`}><UserAvatar person={post.author}/><div className="activity-copy"><b>{post.author.displayName}</b><span>{post.text}</span><small><RelativeTime value={post.createdAt}/></small></div></div>)}
          {!feed.isLoading && !feed.isError && !feed.data?.length && <EmptyState icon={Users} title="المجتمع بانتظارك" text="شارك فكرة أو تعرّف على الأعضاء."/>}
        </section>
      </div>
      <div className="secure-note"><ShieldCheck size={17}/><span>كل مساحات البوت تعمل بوضع <b>المحاكاة</b>. لن يتم الاتصال بصفحة Meta قبل إعداد بيانات الاعتماد والعامل الدائم.</span><Link href="/bots" data-testid="link-simulation-info">التفاصيل <ArrowLeft size={13}/></Link></div>
    </>}
  </Shell>;
}
function LoadingRows() { return <div className="loading-rows" data-testid="state-loading"><i/><i/><i/></div>; }

function botStatus(status: Bot['status']) {
  if (status === 'running') return { title: 'قيد التشغيل', cls: 'running' };
  if (status === 'stopped') return { title: 'متوقف', cls: 'stopped' };
  return { title: 'الإعداد مطلوب', cls: 'setup' };
}
function BotRow({ bot }: { bot: Bot }) {
  const state = botStatus(bot.status);
  return <Link href={`/bots/${bot.id}`} data-testid={`bot-row-${bot.id}`} className="bot-row">
    <div className="bot-mark"><BotIcon size={18}/></div><div className="bot-row-main"><b>{bot.name}</b><span>{bot.pageName || 'لم تُربط صفحة بعد'} · Meta Messenger</span></div>
    <span className={`bot-status ${state.cls}`}><i/>{state.title}</span><span className="simulation-tag">محاكاة</span><ChevronLeft size={15} className="muted-icon"/>
  </Link>;
}

type BotFormValues = { name: string };
function BotsPage() {
  const client = useQueryClient();
  const list = useListBots({ query: { queryKey: getListBotsQueryKey() } });
  const create = useCreateBot();
  const [open, setOpen] = useState(false);
  const form = useForm<BotFormValues>({ defaultValues: { name: '' } });
  const submit = form.handleSubmit(values => create.mutate({ data: { name: values.name.trim() } }, {
    onSuccess: () => { void client.invalidateQueries({ queryKey: getListBotsQueryKey() }); form.reset(); setOpen(false); },
  }));
  return <Shell title="مساحات البوت" subtitle="مساحات عمل منظمة لبوتات صفحات Meta Messenger.">
    <div className="page-toolbar"><div className="toolbar-status"><span className="live-pip"/> وضع المحاكاة نشط</div><Button onClick={() => setOpen(v => !v)} data-testid="button-new-bot" className="button-primary gap-2"><Plus size={16}/> مساحة جديدة</Button></div>
    {open && <div className="compose-panel fade-up"><div className="panel-head"><div><span className="section-overline">مساحة جديدة</span><h3>أنشئ مساحة بوت</h3></div><button onClick={() => setOpen(false)} data-testid="button-close-bot-form" aria-label="إغلاق"><X size={18}/></button></div>
      <Form {...form}><form onSubmit={submit} className="inline-form"><FormField control={form.control} name="name" rules={{ required: 'اكتب اسماً للمساحة', minLength: { value: 2, message: 'الاسم قصير جداً' }, maxLength: { value: 64, message: 'الاسم طويل جداً' } }} render={({ field }) => <FormItem className="flex-1"><FormLabel>اسم المساحة</FormLabel><FormControl><Input {...field} placeholder="مثال: متجر الربيع" data-testid="input-bot-name"/></FormControl><FormMessage/></FormItem>}/><Button type="submit" disabled={create.isPending} data-testid="button-create-bot" className="button-primary self-end">{create.isPending ? <LoaderCircle className="animate-spin" size={16}/> : 'إنشاء المساحة'}</Button></form></Form>
      <p className="form-hint"><ShieldCheck size={14}/> تُنشأ المساحة بوضع المحاكاة فقط، ولا تتصل بصفحة حقيقية.</p>
    </div>}
    {list.isLoading ? <LoadingRows/> : list.isError ? <ErrorState retry={() => list.refetch()}/> : list.data?.length ? <div className="bot-list">{list.data.map(bot => <BotRow key={bot.id} bot={bot}/>)}</div> : !open && <EmptyState icon={BotIcon} title="لا توجد مساحات بعد" text="أنشئ أول مساحة بوت لتبدأ تنظيم عملك."/>}
    <div className="meta-safety"><div className="safety-icon"><ShieldCheck size={19}/></div><div><b>إعدادات Meta لم تُربط بعد</b><p>هذه مساحة تجريبية فقط. ربط الصفحات الرسمي لكل عضو سيكون متاحاً بعد إعداد بيانات Meta والعامل الدائم. لن نطلب كلمة مرور Facebook الشخصية.</p></div><span className="safety-label">محاكاة</span></div>
  </Shell>;
}

function BotConsole() {
  const [, params] = useRoute('/bots/:botId');
  const [, setLocation] = useLocation();
  const botId = Number(params?.botId);
  const validId = Number.isFinite(botId) && botId > 0 ? botId : 0;
  const client = useQueryClient();
  const allBots = useListBots({ query: { queryKey: getListBotsQueryKey() } });
  const bot = allBots.data?.find(row => row.id === validId);
  const logs = useListBotLogs(validId, { query: { enabled: validId > 0, queryKey: getListBotLogsQueryKey(validId), refetchInterval: bot?.status === 'running' ? 3000 : false } });
  const action = useRunBotAction();
  const update = useUpdateBot();
  const remove = useDeleteBot();
  const [terminal, setTerminal] = useState('');
  const [rename, setRename] = useState(false);
  const [newName, setNewName] = useState('');
  const runAction = (intent: 'start' | 'stop' | 'restart' | 'command', command?: string) => {
    if (!bot) return;
    action.mutate({ botId: bot.id, data: { action: intent, ...(command ? { command } : {}) } }, {
      onSuccess: () => { void client.invalidateQueries({ queryKey: getListBotsQueryKey() }); void client.invalidateQueries({ queryKey: getListBotLogsQueryKey(bot.id) }); setTerminal(''); },
    });
  };
  const saveName = () => { if (bot && newName.trim()) update.mutate({ botId: bot.id, data: { name: newName.trim() } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getListBotsQueryKey() }); setRename(false); } }); };
  const deleteWorkspace = () => { if (bot && window.confirm('هل تريد حذف مساحة العمل هذه؟')) remove.mutate({ botId: bot.id }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getListBotsQueryKey() }); setLocation('/bots'); } }); };
  return <Shell title={bot?.name || 'وحدة التحكم'} subtitle="محطة آمنة لاستعراض السلوك التجريبي لمساحتك.">
    {allBots.isLoading ? <PageSkeleton/> : allBots.isError ? <ErrorState retry={() => allBots.refetch()}/> : !bot ? <EmptyState icon={BotIcon} title="المساحة غير موجودة" text="قد تكون أزيلت أو لا تملك صلاحية الوصول إليها."/> : <>
      <div className="console-top"><Link href="/bots" data-testid="link-bot-list" className="back-link"><ArrowLeft size={15}/> كل المساحات</Link><span className="simulation-tag"><ShieldCheck size={12}/> simulation</span></div>
      <section className="console-hero"><div className="console-bot-symbol"><BotIcon size={27}/></div><div className="console-title">{rename ? <div className="rename-inline"><Input value={newName} onChange={e => setNewName(e.target.value)} data-testid="input-rename-bot"/><Button onClick={saveName} data-testid="button-save-bot-name" size="sm"><Check size={15}/></Button></div> : <h2>{bot.name}</h2>}<div className="console-subline"><span className={`bot-status ${botStatus(bot.status).cls}`}><i/>{botStatus(bot.status).title}</span><span>·</span><span>Meta Messenger</span><span>·</span><span>{bot.pageName || 'صفحة غير مرتبطة'}</span></div></div>
        <Button variant="outline" onClick={() => { setNewName(bot.name); setRename(true); }} data-testid="button-rename-bot" className="gap-2"><Settings2 size={15}/> تعديل الاسم</Button>
      </section>
      <BotPackageUpload bot={bot}/>
      <div className="console-grid">
        <section className="section-card console-control"><div className="section-title"><div><span className="section-overline">تحكم آمن</span><h2>الإجراءات</h2></div><span className="chip simulation-chip">simulation</span></div>
          <p className="console-explain">الإجراءات التالية تحاكي حالات التشغيل ولا تتصل بخدمات خارجية.</p>
          <div className="action-stack">
            <button onClick={() => runAction('start')} disabled={action.isPending} data-testid="button-bot-start" className="console-action"><span className="action-icon green"><Radio size={17}/></span><div><b>تشغيل تجريبي</b><small>بدء حالة المحاكاة</small></div><ArrowLeft size={14}/></button>
            <button onClick={() => runAction('stop')} disabled={action.isPending} data-testid="button-bot-stop" className="console-action"><span className="action-icon amber"><X size={17}/></span><div><b>إيقاف تجريبي</b><small>إيقاف الحالة الحالية</small></div><ArrowLeft size={14}/></button>
            <button onClick={() => runAction('restart')} disabled={action.isPending} data-testid="button-bot-restart" className="console-action"><span className="action-icon cyan"><Zap size={17}/></span><div><b>إعادة تشغيل تجريبية</b><small>إعادة الحالة في المحاكاة</small></div><ArrowLeft size={14}/></button>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (terminal.trim()) runAction('command', terminal.trim()); }} className="terminal-form"><label htmlFor="bot-command">أمر تجريبي محدود</label><div><Input id="bot-command" value={terminal} onChange={e => setTerminal(e.target.value)} maxLength={120} placeholder="اكتب أمراً مدعوماً..." data-testid="input-bot-command"/><Button type="submit" aria-label="إرسال الأمر" disabled={action.isPending || !terminal.trim()} data-testid="button-run-command"><Send size={15}/></Button></div></form>
          <p className="console-warning"><ShieldCheck size={14}/> لا تُنفّذ أوامر النظام أو التعليمات البرمجية هنا.</p>
          <button onClick={deleteWorkspace} disabled={remove.isPending} data-testid="button-delete-bot" className="delete-action">حذف مساحة العمل <ArrowLeft size={14}/></button>
        </section>
        <section className="section-card logs-card"><div className="section-title"><div><span className="section-overline">سجل المحاكاة</span><h2>مخرجات المساحة</h2></div><span className="logs-live logs-simulation">SIMULATION</span></div>
          {logs.isLoading ? <LoadingRows/> : logs.isError ? <ErrorState retry={() => logs.refetch()}/> : logs.data?.length ? <div className="log-list">{logs.data.map(log => <LogRow key={log.id} log={log}/>)}</div> : <EmptyState icon={Activity} title="لا توجد أحداث بعد" text="ستظهر هنا مخرجات المحاكاة عند تنفيذ إجراء."/>}
        </section>
      </div>
      <div className="meta-safety"><ShieldCheck size={18}/><span>simulation — هذه النتائج تمثيلية ولا تعني أن البوت يعمل فعلياً على Meta.</span></div>
    </>}
  </Shell>;
}
function LogRow({ log }: { log: BotLog }) {
  const colors: Record<string, string> = { success: 'log-success', warning: 'log-warning', error: 'log-error', info: 'log-info' };
  return <div className="log-row" data-testid={`log-row-${log.id}`}><time><RelativeTime value={log.createdAt}/></time><span className={`log-level ${colors[log.level] || 'log-info'}`}>{log.level}</span><span className="log-message">{log.message}</span></div>;
}

function Community() {
  const client = useQueryClient();
  const posts = useListFeed({ query: { queryKey: getListFeedQueryKey() } });
  const profile = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });
  const create = useCreatePost();
  const toggle = useTogglePostLike();
  const form = useForm<{ text: string }>({ defaultValues: { text: '' } });
  const submit = form.handleSubmit(({ text }) => create.mutate({ data: { text: text.trim() } }, { onSuccess: () => { form.reset(); void client.invalidateQueries({ queryKey: getListFeedQueryKey() }); } }));
  return <Shell title="المجتمع" subtitle="أفكار صغيرة، حوارات كبيرة.">
    <section className="compose-panel post-composer"><div className="composer-title"><UserAvatar person={profile.data}/><div><b>مساحة المشاركة</b><span>اكتب شيئاً يستحق أن يُقرأ.</span></div><span className="composer-mark"><Sparkles size={16}/></span></div>
      <Form {...form}><form onSubmit={submit}><FormField control={form.control} name="text" rules={{ required: 'اكتب شيئاً للمشاركة', maxLength: { value: 1000, message: 'المنشور يتجاوز الحد المسموح' } }} render={({ field }) => <FormItem><FormControl><Textarea {...field} rows={3} maxLength={1000} placeholder="ما الذي تعمل عليه اليوم؟" data-testid="input-create-post"/></FormControl><FormMessage/></FormItem>}/><div className="composer-foot"><span>نص المنشور محدود بـ ١٠٠٠ حرف</span><Button type="submit" disabled={create.isPending} data-testid="button-create-post" className="button-primary gap-2">{create.isPending ? <LoaderCircle className="animate-spin" size={15}/> : <><Send size={15}/> شارك الفكرة</>}</Button></div></form></Form>
    </section>
    <div className="feed-heading"><span className="section-overline">LATEST / COMMUNITY</span><h2>آخر ما يشاركه الأعضاء</h2></div>
    {posts.isLoading ? <LoadingRows/> : posts.isError ? <ErrorState retry={() => posts.refetch()}/> : posts.data?.length ? <div className="feed-list">{posts.data.map((post, i) => <PostCard key={post.id} post={post} index={i} onLike={() => toggle.mutate({ postId: post.id }, { onSuccess: () => void client.invalidateQueries({ queryKey: getListFeedQueryKey() }) })}/>)}</div> : <EmptyState icon={MessageCircle} title="هنا تبدأ المحادثة" text="شارك أول فكرة لتفتح مساحة جديدة للأعضاء."/>}
  </Shell>;
}
function PostCard({ post, index, onLike }: { post: FeedPost; index: number; onLike: () => void }) {
  return <article className={`post-card fade-up delay-${Math.min(index % 4, 3)}`} data-testid={`post-card-${post.id}`}>
    <header className="post-author"><UserAvatar person={post.author}/><div><b>{post.author.displayName}</b><span>@{post.author.username}</span></div><div className="post-time"><RelativeTime value={post.createdAt}/><span>·</span><span className="post-dot"/></div></header>
    <p className="post-text" data-testid={`post-text-${post.id}`}>{post.text}</p>
    <footer className="post-actions"><button onClick={onLike} data-testid={`button-like-${post.id}`} className={`like-action ${post.likedByMe ? 'liked' : ''}`}><Heart size={17} fill={post.likedByMe ? 'currentColor' : 'none'}/><span>{post.likeCount}</span><span>{post.likedByMe ? 'أعجبك' : 'إعجاب'}</span></button><Link href={`/messages/${post.author.username}`} data-testid={`link-message-author-${post.id}`} className="post-message"><MessageCircle size={16}/> أرسل رسالة</Link><span className="post-share-label">ZED / COMMUNITY</span></footer>
  </article>;
}

function ProfileSettings() {
  const client = useQueryClient();
  const profile = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });
  const save = useUpdateProfile();
  const form = useForm<{ displayName: string; username: string; bio: string; avatarUrl: string; coverUrl: string }>({
    defaultValues: { displayName: '', username: '', bio: '', avatarUrl: '', coverUrl: '' },
  });
  const initialized = useRef(false);
  useEffect(() => {
    if (profile.data && !initialized.current) {
      initialized.current = true;
      form.reset({
        displayName: profile.data.displayName || '', username: profile.data.username || '',
        bio: profile.data.bio || '', avatarUrl: profile.data.avatarUrl || '', coverUrl: profile.data.coverUrl || '',
      });
    }
  }, [profile.data, form]);
  const avatarUrl = form.watch('avatarUrl');
  const coverUrl = form.watch('coverUrl');
  const submit = form.handleSubmit(values => save.mutate({ data: {
    displayName: values.displayName.trim(), username: values.username.replace(/^@/, '').trim(),
    bio: values.bio.trim() || null, avatarUrl: values.avatarUrl.trim() || null, coverUrl: values.coverUrl.trim() || null,
  } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetProfileQueryKey() }); } }));
  return <Shell title="ملفي الشخصي" subtitle="صورتك، اسمك، ومساحتك في مجتمع زِد.">
    {profile.isLoading ? <PageSkeleton/> : profile.isError ? <ErrorState retry={() => profile.refetch()}/> : <>
      <div className="profile-preview">
        <div className="profile-cover" style={coverUrl ? { backgroundImage: `linear-gradient(90deg,rgba(11,12,19,.3),rgba(11,12,19,.05)),url("${coverUrl}")` } : undefined} data-testid="profile-cover-preview">
          <span className="cover-label"><Sparkles size={14}/> معاينة الملف</span>
        </div>
        <div className="profile-preview-bottom"><UserAvatar person={{ ...profile.data, avatarUrl: avatarUrl || null }} size="lg"/><div><h2>{form.watch('displayName') || profile.data?.displayName}</h2><span>@{form.watch('username') || profile.data?.username}</span><p>{form.watch('bio') || profile.data?.bio || 'لم تضف نبذة بعد.'}</p></div><span className="profile-type">عضو زِد</span></div>
      </div>
      <div className="profile-grid">
        <section className="section-card profile-form-card"><div className="section-title"><div><span className="section-overline">هويتك</span><h2>معلومات الملف</h2></div><UserRound className="muted-icon"/></div>
          <Form {...form}><form onSubmit={submit} className="profile-form">
            <div className="form-row">
              <FormField control={form.control} name="displayName" rules={{ required: 'الاسم مطلوب', maxLength: { value: 48, message: 'الحد الأقصى ٤٨ حرفاً' } }} render={({ field }) => <FormItem><FormLabel>الاسم الظاهر</FormLabel><FormControl><Input {...field} placeholder="اسمك في زِد" data-testid="input-profile-display-name"/></FormControl><FormMessage/></FormItem>}/>
              <FormField control={form.control} name="username" rules={{ required: 'اسم المستخدم مطلوب', minLength: { value: 3, message: 'استخدم ٣ أحرف على الأقل' }, maxLength: { value: 24, message: 'الحد الأقصى ٢٤ حرفاً' }, pattern: { value: /^[a-zA-Z0-9_]+$/, message: 'استخدم أحرفاً لاتينية وأرقاماً وشرطة سفلية فقط' } }} render={({ field }) => <FormItem><FormLabel>اسم المستخدم</FormLabel><FormControl><div className="username-input"><span>@</span><Input {...field} placeholder="zed_member" data-testid="input-profile-username"/></div></FormControl><FormMessage/></FormItem>}/>
            </div>
            <FormField control={form.control} name="bio" rules={{ maxLength: { value: 280, message: 'الحد الأقصى ٢٨٠ حرفاً' } }} render={({ field }) => <FormItem><FormLabel>نبذة قصيرة</FormLabel><FormControl><Textarea {...field} rows={3} maxLength={280} placeholder="ما الذي تحب أن تبنيه؟" data-testid="input-profile-bio"/></FormControl><div className="field-meta"><FormMessage/><span>{field.value?.length || 0}/280</span></div></FormItem>}/>
            <FormField control={form.control} name="avatarUrl" render={({ field }) => <FormItem><FormLabel>رابط الصورة الشخصية</FormLabel><FormControl><Input {...field} type="url" placeholder="https://..." dir="ltr" data-testid="input-profile-avatar-url"/></FormControl><span className="field-hint">يمكن استخدام صور GIF المتحركة.</span><FormMessage/></FormItem>}/>
            <FormField control={form.control} name="coverUrl" render={({ field }) => <FormItem><FormLabel>رابط صورة الغلاف</FormLabel><FormControl><Input {...field} type="url" placeholder="https://..." dir="ltr" data-testid="input-profile-cover-url"/></FormControl><FormMessage/></FormItem>}/>
            <div className="profile-form-foot"><span><ShieldCheck size={14}/> معلوماتك مرئية لأعضاء المجتمع.</span><Button type="submit" disabled={save.isPending} data-testid="button-save-profile" className="button-primary">{save.isPending ? <LoaderCircle className="animate-spin" size={16}/> : 'حفظ التغييرات'}</Button></div>
          </form></Form>
        </section>
        <aside className="section-card profile-aside"><span className="aside-mark"><UserRound size={20}/></span><span className="section-overline">PROFILE / PUBLIC</span><h3>اجعل حضورك<br/>يشبهك.</h3><p>اسم المستخدم الفريد يساعد أصدقاءك على العثور عليك وبدء محادثة مباشرة.</p><div className="aside-handle">@{form.watch('username') || 'username'}</div><div className="aside-footer"><span>HELLKING</span><span>01 / ZED ID</span></div></aside>
      </div>
    </>}
  </Shell>;
}

type MessageForm = { text: string };
function Messages() {
  const [, params] = useRoute('/messages/:username');
  const [, setLocation] = useLocation();
  const routeUsername = params?.username?.replace(/^@/, '').toLowerCase() || '';
  const client = useQueryClient();
  const conversations = useListConversations({ query: { queryKey: getListConversationsQueryKey() } });
  const target = conversations.data?.find(item => item.otherUser.username.toLowerCase() === routeUsername);
  const selected = routeUsername ? target : undefined;
  const [searchName, setSearchName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const users = useSearchUsers({ q: searchQuery }, { query: { enabled: searchQuery.length > 0, queryKey: getSearchUsersQueryKey({ q: searchQuery }) } });
  const create = useCreateConversation();
  const messages = useListMessages(selected?.id || 0, { query: { enabled: !!selected?.id, queryKey: getListMessagesQueryKey(selected?.id || 0) } });
  const send = useSendMessage();
  const form = useForm<MessageForm>({ defaultValues: { text: '' } });
  const beginConversation = (username: string) => create.mutate({ data: { username: username.replace(/^@/, '') } }, {
    onSuccess: conversation => { void client.invalidateQueries({ queryKey: getListConversationsQueryKey() }); setLocation(`/messages/${conversation.otherUser.username}`); },
  });
  const submit = form.handleSubmit(({ text }) => {
    if (!selected || !text.trim()) return;
    send.mutate({ conversationId: selected.id, data: { text: text.trim() } }, {
      onSuccess: () => { form.reset(); void client.invalidateQueries({ queryKey: getListMessagesQueryKey(selected.id) }); void client.invalidateQueries({ queryKey: getListConversationsQueryKey() }); },
    });
  });
  return <Shell title="الرسائل" subtitle="محادثات مباشرة مع أعضاء مجتمع زِد.">
    <div className="messages-layout">
      <aside className="conversation-panel">
        <div className="conversation-header"><div><span className="section-overline">INBOX / DIRECT</span><h2>المحادثات</h2></div><MessageSquare size={19}/></div>
        <div className="member-search"><Input value={searchName} onChange={e => { setSearchName(e.target.value); setSearchQuery(e.target.value.trim().replace(/^@/, '')); }} placeholder="ابحث باسم المستخدم" data-testid="input-search-user"/></div>
        {searchName && <div className="search-results">{users.isLoading ? <LoadingRows/> : users.isError ? <span className="tiny-error">تعذر البحث الآن.</span> : users.data?.length ? users.data.slice(0,5).map(user => <button key={user.id} onClick={() => beginConversation(user.username)} data-testid={`button-message-user-${user.id}`} className="search-result"><UserAvatar person={user} size="sm"/><span><b>{user.displayName}</b><small>@{user.username}</small></span><ArrowUpLeft size={14}/></button>) : <span className="tiny-error">{searchQuery.length ? 'لا نتائج لهذا الاسم.' : 'اكتب اسم مستخدم للبحث.'}</span>}</div>}
        <div className="conversation-list">
          {conversations.isLoading ? <LoadingRows/> : conversations.isError ? <ErrorState retry={() => conversations.refetch()}/> : conversations.data?.length ? conversations.data.map(item => <ConversationRow key={item.id} conversation={item} active={item.id === selected?.id}/>) : <EmptyState icon={MessageCircle} title="لا توجد محادثات" text="ابحث عن عضو لبدء حديث جديد."/>}
        </div>
      </aside>
      <section className="chat-panel">
        {selected ? <>
          <div className="chat-header"><button onClick={() => setLocation('/messages')} data-testid="button-back-conversations" className="chat-back"><ChevronLeft size={16}/></button><UserAvatar person={selected.otherUser}/><div><b>{selected.otherUser.displayName}</b><span>@{selected.otherUser.username}</span></div><Link href={`/profile`} data-testid="link-chat-profile" className="chat-profile"><UserRound size={16}/></Link></div>
          <div className="chat-messages" data-testid="list-messages">
            {messages.isLoading ? <LoadingRows/> : messages.isError ? <ErrorState retry={() => messages.refetch()}/> : messages.data?.length ? messages.data.map(message => <div key={message.id} className={`message-bubble ${message.sender.username === selected.otherUser.username ? 'received' : 'sent'}`} data-testid={`message-${message.id}`}><p>{message.text}</p><time><RelativeTime value={message.createdAt}/></time></div>) : <div className="chat-empty"><span><MessageCircle size={20}/></span><b>ابدأ الحديث</b><small>أرسل أول رسالة إلى @{selected.otherUser.username}</small></div>}
          </div>
          <Form {...form}><form onSubmit={submit} className="message-form"><FormField control={form.control} name="text" rules={{ required: 'اكتب رسالة أولاً', maxLength: { value: 2000, message: 'الرسالة طويلة جداً' } }} render={({ field }) => <FormItem className="flex-1"><FormControl><Input {...field} maxLength={2000} placeholder="اكتب رسالة..." data-testid="input-send-message"/></FormControl><FormMessage/></FormItem>}/><Button type="submit" aria-label="إرسال الرسالة" disabled={send.isPending} data-testid="button-send-message" className="button-primary send-button"><Send size={17}/></Button></form></Form>
        </> : <div className="chat-empty chat-no-selection"><span><MessageCircle size={23}/></span><b>اختر محادثة</b><small>أو ابحث عن عضو وابدأ محادثة جديدة.</small></div>}
      </section>
    </div>
  </Shell>;
}
function ConversationRow({ conversation, active }: { conversation: Conversation; active: boolean }) {
  return <Link href={`/messages/${conversation.otherUser.username}`} data-testid={`conversation-${conversation.id}`} className={`conversation-row ${active ? 'active' : ''}`}><UserAvatar person={conversation.otherUser}/><div className="conversation-copy"><div><b>{conversation.otherUser.displayName}</b><small><RelativeTime value={conversation.updatedAt}/></small></div><p>{conversation.lastMessage || 'ابدأ أول محادثة بينكما'}</p><span>@{conversation.otherUser.username}</span></div><ChevronLeft size={14} className="muted-icon"/></Link>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkRouter/></WouterRouter>;
}

export default App;