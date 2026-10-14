/* YSC Student Hub — Help Center */
'use strict';

// ── Content Data ───────────────────────────────────────────────────────────

const HELP_CATEGORIES = [
  { id: 'getting-started',   icon: '🚀', label: 'Getting Started' },
  { id: 'personalizing',     icon: '🎨', label: 'Personalizing Your Hub' },
  { id: 'canvas',            icon: '📚', label: 'Canvas' },
  { id: 'slack',             icon: '💬', label: 'Slack' },
  { id: 'drive',             icon: '📁', label: 'Google Drive' },
  { id: 'calendar',          icon: '🗓️', label: 'Calendar' },
  { id: 'chatbot',           icon: '🤖', label: 'AI Chatbot' },
  { id: 'zoom',              icon: '🎥', label: 'Zoom' },
  { id: 'grades',            icon: '📊', label: 'Grades' },
  { id: 'photos',            icon: '📸', label: 'Photos & Decorations' },
  { id: 'settings',          icon: '⚙️', label: 'Settings' },
  { id: 'troubleshooting',   icon: '🛠️', label: 'Troubleshooting' },
];

const HELP_ARTICLES = {

  'getting-started': [
    {
      id: 'welcome',
      icon: '👋',
      title: 'Welcome to YSC Student Hub',
      blurb: 'Learn what the hub is and how it works',
      searchText: 'welcome overview hub student what is',
      content: `
        <p>YSC Student Hub is your all-in-one academic workspace — designed just for YSC Academy students.
        Everything you need for school is in one place: your Canvas assignments, Slack messages, Google Drive files,
        calendar, grades, and an AI assistant that helps you find anything in seconds.</p>

        <h3>What can I do here?</h3>
        <ul>
          <li><strong>Canvas</strong> — See all your assignments, courses, announcements, and grades</li>
          <li><strong>Slack</strong> — Read and send messages to your class channels and teachers</li>
          <li><strong>Google Drive</strong> — Browse your recent files and files shared with you</li>
          <li><strong>Calendar</strong> — View upcoming deadlines and sync your Canvas assignments</li>
          <li><strong>AI Chatbot</strong> — Ask questions, find files, get help with anything</li>
          <li><strong>Grades</strong> — See your current GPA and course grades at a glance</li>
          <li><strong>Zoom</strong> — Jump into class meetings instantly</li>
        </ul>

        <h3>How is it personalized?</h3>
        <p>Your hub is completely customizable. Change fonts, colors, backgrounds, rearrange panels,
        and decorate with stickers. Your choices are saved automatically and show up every time you log in.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Click <strong>Start Tour</strong> at the top of this Help Center to get a quick
          guided walkthrough of every feature on your hub.
        </div>
      `
    },
    {
      id: 'views',
      icon: '🖥️',
      title: 'Navigating the Hub',
      blurb: 'How Home, the tabs, and the sidebar fit together',
      searchText: 'navigation sidebar home today view tabs canvas slack drive layout ai chat',
      content: `
        <p>When you log in you land on <strong>Home</strong> — your AI assistant. It greets you
        with what matters today (assignments due and your mentor's availability) and
        you can ask it anything. Everything else is one tap away.</p>

        <h3>The tabs</h3>
        <ul>
          <li><strong>🏠 Home</strong> — Your AI assistant and the day's plan. This is where you start.</li>
          <li><strong>📅 Today</strong> — The fuller daily overview: your mentor's weekly message,
          teacher broadcasts, task checklist, and the Mentor Chat.</li>
          <li><strong>📈 Growth</strong> — Personal goals you set and track, plus a grade snapshot.</li>
          <li><strong>👥 Your Team</strong> (it shows your first name, like “Adam's Team”) — Your support team with real-time availability, plus your Team Schedule. Tap <em>+ Add to my schedule</em> to add your own practices and games; they show up on your Calendar automatically.</li>
          <li><strong>🎥 Virtual Meetings</strong> — Your Zoom links and study huddles.
          <em>(On a phone, this one lives under the "More" menu.)</em></li>
        </ul>

        <h3>Left sidebar (tools)</h3>
        <p>Icons for Canvas, Slack, Google Drive, Calendar, and Grades — click one to open that
        tool over the current view; the "← Back" bar returns you. The sidebar's <strong>AI Chat</strong>
        icon just takes you to the Home tab. On a phone the sidebar is the "More" menu.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Home loads automatically every time you open the hub. Your
          dashboard tabs are right next to it whenever you want them.
        </div>
      `
    },
    {
      id: 'features-overview',
      icon: '📋',
      title: 'Overview of All Features',
      blurb: 'A full list of everything available to you',
      searchText: 'features overview all panels list what can I do',
      content: `
        <p>Here is everything available to you on YSC Student Hub:</p>

        <h3>Academic Tools</h3>
        <ul>
          <li><strong>📚 Canvas</strong> — Assignments, courses, announcements, and grade syncing</li>
          <li><strong>📊 Grades</strong> — Live GPA and per-course grade view</li>
          <li><strong>🗓️ Calendar</strong> — Monthly view, event adding, Canvas assignment sync</li>
          <li><strong>📁 Google Drive</strong> — Browse and open recent and shared files</li>
        </ul>

        <h3>Communication</h3>
        <ul>
          <li><strong>💬 Slack</strong> — Browse channels, read and send messages, direct messages</li>
          <li><strong>🎥 Zoom</strong> — Join school meetings and save personal Zoom links</li>
        </ul>

        <h3>AI Assistant</h3>
        <ul>
          <li><strong>🤖 AI Chatbot</strong> — Ask questions, search Drive, summarize announcements, get YouTube videos</li>
        </ul>

        <h3>Personalization</h3>
        <ul>
          <li><strong>🎨 Themes</strong> — 10 preset color themes + custom color picker</li>
          <li><strong>🔤 Fonts</strong> — 10 font choices with size control</li>
          <li><strong>🖼️ Backgrounds</strong> — Preset photos or upload your own</li>
          <li><strong>✨ Decorations</strong> — Panel stickers, custom borders, rename panels</li>
          <li><strong>🗂️ Layout</strong> — Drag and resize any panel, reset to default</li>
          <li><strong>🔗 Share</strong> — Share your theme with friends using a theme code</li>
        </ul>
      `
    },
    {
      id: 'chatbot-intro',
      icon: '🤖',
      title: 'How to Use the AI Chatbot',
      blurb: 'Get the most out of your AI assistant',
      searchText: 'chatbot AI assistant how to use ask questions drive files',
      content: `
        <p>The YSC Academy AI Assistant is a powerful helper built right into your hub.
        You can ask it almost anything about your schoolwork and it will search your data to answer.</p>

        <h3>What can I ask?</h3>
        <ul>
          <li>"What assignments are due this week?"</li>
          <li>"Find my essay in Google Drive"</li>
          <li>"What are the most important announcements today?"</li>
          <li>"Show me a video explaining photosynthesis"</li>
          <li>"How do I submit an assignment on Canvas?"</li>
          <li>"What is my current grade in Chemistry?"</li>
          <li>"Add all my Canvas assignments to my calendar"</li>
        </ul>

        <h3>Drive search</h3>
        <p>When you ask about a document or file, the chatbot will automatically search your
        Google Drive and return matching files with direct links to open them.</p>

        <h3>YouTube videos</h3>
        <p>The chatbot can find YouTube videos on any subject — just ask! Try
        <em>"Show me a video about the quadratic formula"</em> or <em>"Find a tutorial on essay writing."</em></p>

        <h3>Tips for good results</h3>
        <ul>
          <li>Be specific — instead of "my essay," say "my history essay about World War II"</li>
          <li>Use the suggestion chips below the chat input for quick common questions</li>
          <li>You can ask follow-up questions — the chatbot remembers the conversation</li>
        </ul>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> The chatbot has access to your Canvas assignments, Google Drive files,
          Slack announcements, and grade data — so it can give you personalized answers.
        </div>
      `
    },
    {
      id: 'get-help',
      icon: '🙋',
      title: 'How to Get Help',
      blurb: 'Options if something is not working',
      searchText: 'help support not working problem issue contact teacher',
      content: `
        <p>If something on your hub is not working the way you expect, here are the steps to try:</p>

        <h3>Step 1 — Refresh the page</h3>
        <p>Many small issues are fixed with a simple refresh. Press <strong>Cmd + R</strong> (Mac) or
        <strong>Ctrl + R</strong> (Windows) to reload.</p>

        <h3>Step 2 — Check individual panel refresh buttons</h3>
        <p>Each panel (Canvas, Slack, Drive, etc.) has a small ↻ refresh button in its header.
        Click it to reload just that panel's data without refreshing the whole page.</p>

        <h3>Step 3 — Check the Troubleshooting section</h3>
        <p>Go to <strong>Troubleshooting</strong> in the left sidebar of this Help Center for answers
        to common problems like Canvas not loading, Google Drive not connecting, and more.</p>

        <h3>Step 4 — Ask the AI chatbot</h3>
        <p>Type your problem into the AI chatbot — it can often guide you through fixing it.</p>

        <h3>Step 5 — Tell your teacher</h3>
        <p>If nothing else works, let your teacher know. They can see which students are active on the
        hub and can help troubleshoot from their teacher dashboard.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> You can open this Help Center at any time by clicking the
          <strong>? Help</strong> button in the top navigation bar.
        </div>
      `
    },
  ],

  'personalizing': [
    {
      id: 'move-resize',
      icon: '↔️',
      title: 'Navigating Panels',
      blurb: 'Switch between tools using the sidebar',
      searchText: 'navigate panel layout sidebar canvas slack drive switch',
      content: `
        <p>Your hub uses a sidebar navigation layout. Click any icon in the left sidebar to open
        the corresponding tool in the main content area.</p>

        <h3>Opening a tool</h3>
        <ol class="help-step-list">
          <li>Find the sidebar on the left edge of the screen.</li>
          <li>Click any icon — Canvas, Slack, Drive, Calendar, or Grades.</li>
          <li>That tool opens over the current view; click "← Back" to return.</li>
        </ol>

        <h3>Getting back to Home</h3>
        <ol class="help-step-list">
          <li>Click the <strong>🏠 Home</strong> tab at the top of the main area — or "← Back" if a tool is open.</li>
          <li>Home is your AI assistant and the day's plan. The <strong>📅 Today</strong> tab next to it has the fuller daily overview.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> You can personalize the look of each panel — change titles, colors,
          and add stickers — using the <strong>⚙️ Settings</strong> → <strong>Decorate</strong> tab.
        </div>
      `
    },
    {
      id: 'fonts',
      icon: '🔤',
      title: 'Changing Fonts',
      blurb: 'Choose from 10 fonts and adjust the text size',
      searchText: 'font family size text change choose apply settings',
      content: `
        <p>You can choose from 10 different fonts for your hub and control the size of all text.</p>

        <h3>How to change your font</h3>
        <ol class="help-step-list">
          <li>Click the <strong>⚙️ Settings</strong> gear icon in the top navigation bar.</li>
          <li>Click the <strong>🔤 Fonts</strong> tab.</li>
          <li>Browse the font options and click any font card to preview it instantly.</li>
          <li>Your choice is saved automatically — no need to click Apply.</li>
        </ol>

        <h3>Available fonts</h3>
        <ul>
          <li><strong>System Default</strong> — Clean and fast, uses your device's built-in font</li>
          <li><strong>Inter</strong> — Modern, clean, easy to read</li>
          <li><strong>Playfair Display</strong> — Elegant serif font for a classic look</li>
          <li><strong>Raleway</strong> — Stylish and geometric</li>
          <li><strong>Roboto</strong> — Google's clean readable font</li>
          <li><strong>Lato</strong> — Friendly and approachable</li>
          <li><strong>Merriweather</strong> — Classic newspaper-style serif</li>
          <li><strong>Poppins</strong> — Rounded and modern</li>
          <li><strong>Oswald</strong> — Bold condensed headings</li>
          <li><strong>Comic Neue</strong> — Casual and fun</li>
        </ul>

        <h3>How to adjust text size</h3>
        <ol class="help-step-list">
          <li>In the Fonts tab, find the <strong>Text Size</strong> slider.</li>
          <li>Drag left for smaller text, right for larger text.</li>
          <li>Changes apply instantly across the whole hub.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Font changes apply to all panels at once.
          Your size preference is saved and remembered on every visit.
        </div>
      `
    },
    {
      id: 'colors',
      icon: '🎨',
      title: 'Changing Colors & Themes',
      blurb: 'Choose preset themes or create your own color scheme',
      searchText: 'color theme dark mode light mode accent brand midnight ocean galaxy rose gold custom picker',
      content: `
        <p>You can completely change the look of your hub with preset themes or your own custom colors.
        Your choices are saved automatically.</p>

        <h3>How to change your theme</h3>
        <ol class="help-step-list">
          <li>Click the <strong>⚙️ Settings</strong> gear icon in the top navigation bar.</li>
          <li>Click the <strong>🎨 Colors</strong> tab.</li>
          <li>Click any preset theme to apply it instantly.</li>
          <li>Or use the <strong>custom color picker</strong> to choose your own brand and accent colors.</li>
        </ol>

        <h3>Available preset themes</h3>
        <ul>
          <li><strong>Midnight</strong> — Deep navy and gold</li>
          <li><strong>Ocean</strong> — Cool teal and aqua</li>
          <li><strong>Galaxy</strong> — Purple and indigo</li>
          <li><strong>Rose Gold</strong> — Pink and warm gold</li>
          <li><strong>Forest</strong> — Rich green tones</li>
          <li><strong>Sunset</strong> — Orange, coral, and amber</li>
          <li><strong>Monochrome</strong> — Classic black and grey</li>
          <li>And more — all found in the Colors tab</li>
        </ul>

        <h3>Dark mode & Light mode</h3>
        <ol class="help-step-list">
          <li>In the Colors tab, find the <strong>Dark Mode</strong> toggle.</li>
          <li>Switch it on for a dark background on all panels.</li>
          <li>Switch it off for the default light look.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> You can share your theme with friends! See the
          <em>Sharing Your Theme</em> article to learn how.
        </div>
      `
    },
    {
      id: 'background',
      icon: '🖼️',
      title: 'Changing the Background',
      blurb: 'Set a preset photo or upload your own background',
      searchText: 'background photo upload preset opacity soccer basketball starry custom image',
      content: `
        <p>Your hub background is the image that sits behind all of your panels. You can choose from
        preset photos or upload your own.</p>

        <h3>How to change your background</h3>
        <ol class="help-step-list">
          <li>Click the <strong>⚙️ Settings</strong> gear icon in the top navigation bar.</li>
          <li>Click the <strong>🖼️ BG</strong> tab.</li>
          <li>Click any preset background thumbnail to apply it immediately.</li>
          <li>Or click <strong>Upload Custom Photo</strong> to use your own image.</li>
        </ol>

        <h3>Available preset backgrounds</h3>
        <ul>
          <li>Soccer field</li>
          <li>Basketball court</li>
          <li>Starry night sky</li>
          <li>Library / books</li>
          <li>Mountain landscape</li>
          <li>City skyline</li>
          <li>And more — browse in the Background tab</li>
        </ul>

        <h3>Adjusting the opacity</h3>
        <ol class="help-step-list">
          <li>In the Background tab, find the <strong>Opacity</strong> slider.</li>
          <li>Drag left to make the background more subtle (more transparent).</li>
          <li>Drag right to make it more vivid (more visible).</li>
          <li>The overlay color is always applied on top to keep your panels readable.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> If you upload a personal photo, it stays private —
          only you can see your background.
        </div>
      `
    },
    {
      id: 'decorate',
      icon: '✨',
      title: 'Decorating Panels',
      blurb: 'Add stickers, borders, and rename your panels',
      searchText: 'decorate sticker border rename panel title custom',
      content: `
        <p>You can personalize each panel with stickers, custom borders, and your own titles.</p>

        <h3>How to decorate panels</h3>
        <ol class="help-step-list">
          <li>Click the <strong>⚙️ Settings</strong> gear icon in the top navigation bar.</li>
          <li>Click the <strong>✨ Decorate</strong> tab.</li>
          <li>Select a panel from the list to customize it.</li>
          <li>Choose a sticker to display next to the panel title.</li>
          <li>Choose a border style for the panel frame.</li>
          <li>Type a custom name in the title field to rename the panel.</li>
          <li>Changes apply immediately and are saved automatically.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Renaming a panel is just for display — it does not change what
          the panel does. You can rename "Canvas LMS" to "My Classes" for example.
        </div>
      `
    },
    {
      id: 'share-theme',
      icon: '🔗',
      title: 'Sharing Your Theme',
      blurb: 'Give friends a code to copy your color scheme',
      searchText: 'share theme code friend copy matching hub color',
      content: `
        <p>You can generate a theme code from your current color setup and share it with friends
        so they can have the same look on their hub.</p>

        <h3>How to share your theme</h3>
        <ol class="help-step-list">
          <li>Click the <strong>⚙️ Settings</strong> gear icon in the top navigation bar.</li>
          <li>Click the <strong>🎨 Colors</strong> tab.</li>
          <li>Find the <strong>Share My Theme</strong> button and click it.</li>
          <li>A short theme code will appear — copy it and send it to a friend.</li>
        </ol>

        <h3>How to apply a friend's theme</h3>
        <ol class="help-step-list">
          <li>Open Settings → 🎨 Colors.</li>
          <li>Find the <strong>Apply Theme Code</strong> input field.</li>
          <li>Paste the code your friend shared and press Enter.</li>
          <li>The theme is applied instantly.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Theme codes include your brand color, accent color, and dark/light
          mode preference — everything needed to match your exact setup.
        </div>
      `
    },
  ],

  'canvas': [
    {
      id: 'canvas-overview',
      icon: '📚',
      title: 'Using Canvas on Your Hub',
      blurb: 'View assignments, courses, and announcements',
      searchText: 'canvas assignments courses announcements due date submit grades',
      content: `
        <p>The Canvas panel connects directly to your YSC Academy Canvas account and shows
        your assignments, courses, and announcements — all without leaving the hub.</p>

        <h3>Viewing your courses</h3>
        <p>The <strong>My Courses</strong> section at the top of the Canvas panel lists all your
        active courses. Click any course to filter assignments to just that class.</p>

        <h3>Viewing assignments</h3>
        <p>The <strong>Assignments</strong> section shows your upcoming and recent assignments.
        Each assignment shows its due date, status, and a link to open it directly in Canvas.</p>

        <ul>
          <li><strong>Due soon</strong> — assignments with upcoming deadlines are highlighted</li>
          <li><strong>Missing</strong> — overdue assignments are marked in red</li>
          <li><strong>Submitted</strong> — assignments you have already turned in</li>
        </ul>

        <h3>Viewing announcements</h3>
        <p>The <strong>Announcements</strong> section at the bottom shows the latest posts from
        your teachers. Click any announcement to read the full text.</p>

        <h3>Refreshing Canvas data</h3>
        <p>Click the <strong>↻ refresh button</strong> in the Canvas panel header to reload
        the latest data from Canvas.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Click <strong>📅 Sync All to Calendar</strong> to automatically
          add all your Canvas assignment due dates to your hub calendar.
        </div>
      `
    },
    {
      id: 'canvas-sync',
      icon: '🗓️',
      title: 'Syncing Canvas Assignments to Calendar',
      blurb: 'Add all due dates to your hub calendar automatically',
      searchText: 'canvas sync calendar auto assignments due date',
      content: `
        <p>You can sync all your Canvas assignment due dates to your hub calendar with one click,
        or turn on Auto-sync to keep it updated automatically.</p>

        <h3>One-click sync</h3>
        <ol class="help-step-list">
          <li>Open the Canvas panel on your hub.</li>
          <li>Click the <strong>📅 Sync All to Calendar</strong> button below the panel header.</li>
          <li>All assignment due dates are added to your calendar.</li>
        </ol>

        <h3>Auto-sync</h3>
        <ol class="help-step-list">
          <li>Check the <strong>Auto-sync</strong> checkbox next to the sync button.</li>
          <li>From now on, Canvas assignments will sync to your calendar automatically every time you load the hub.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> After syncing, click the <strong>🗓️ Calendar</strong> panel to see
          all your assignment due dates highlighted on the monthly view.
        </div>
      `
    },
  ],

  'slack': [
    {
      id: 'slack-overview',
      icon: '💬',
      title: 'Using Slack on Your Hub',
      blurb: 'Browse channels, read messages, and send messages',
      searchText: 'slack channel message send direct DM browse find',
      content: `
        <p>The Slack panel connects to your school's Slack workspace so you can read and send
        messages without switching apps.</p>

        <h3>Viewing channels</h3>
        <p>The left side of the Slack panel shows your channels list. Click any channel to open it
        and read the latest messages.</p>

        <h3>Sending a message</h3>
        <ol class="help-step-list">
          <li>Click on a channel in the channel list.</li>
          <li>The message area on the right will show recent messages.</li>
          <li>Type your message in the input bar at the bottom.</li>
          <li>Press <strong>Enter</strong> or click <strong>Send</strong>.</li>
        </ol>

        <h3>Finding a channel</h3>
        <ol class="help-step-list">
          <li>Click <strong>🔍 Browse</strong> in the Slack panel.</li>
          <li>Search for any channel by name.</li>
          <li>Click to join or view it.</li>
        </ol>

        <h3>Direct messages</h3>
        <p>Click the <strong>✉ DMs</strong> button to view your direct message conversations
        with teachers and classmates.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> The AI Chatbot can help you find announcements from specific
          Slack channels — just ask it "What did the announcements channel say today?"
        </div>
      `
    },
  ],

  'drive': [
    {
      id: 'drive-overview',
      icon: '📁',
      title: 'Using Google Drive on Your Hub',
      blurb: 'Find and open your files and shared documents',
      searchText: 'google drive files recent shared documents connect',
      content: `
        <p>The Google Drive panel shows your most recent files and documents shared with you by teachers —
        all without leaving the hub.</p>

        <h3>Connecting Google Drive</h3>
        <ol class="help-step-list">
          <li>Click the <strong>Connect Drive</strong> button in the top navigation bar.</li>
          <li>Sign in with your YSC Academy Google account.</li>
          <li>Your files will appear in the Drive panel automatically.</li>
        </ol>

        <h3>Finding your files</h3>
        <p>The <strong>My Recent Files</strong> section shows files you have opened or edited recently.
        The <strong>Shared with Me</strong> section shows files your teachers have shared.</p>

        <h3>Opening a file</h3>
        <p>Click any file name to open it in a new tab in Google Docs, Slides, Sheets, or Drive.</p>

        <h3>Refreshing your files</h3>
        <p>Click the <strong>↻ refresh button</strong> in the Drive panel header to reload the latest files.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Ask the AI Chatbot to find any file in your Drive by name —
          for example: "Find my essay about the Civil War."
        </div>
      `
    },
  ],

  'calendar': [
    {
      id: 'calendar-overview',
      icon: '🗓️',
      title: 'Using the Calendar',
      blurb: 'View events, deadlines, and sync Canvas assignments',
      searchText: 'calendar event add view month deadline due date sync notifications',
      content: `
        <p>The Calendar panel shows a monthly calendar with all your upcoming events and assignment
        due dates in one place.</p>

        <h3>Navigating months</h3>
        <p>Use the <strong>← and →</strong> arrow buttons in the calendar header to move between months.</p>

        <h3>Seeing assignment due dates</h3>
        <p>Canvas assignment due dates appear as colored dots on the calendar. Click a day to see
        the list of what is due. Sync your Canvas assignments first using the
        <strong>Sync All to Calendar</strong> button in the Canvas panel.</p>

        <h3>Assignment notifications</h3>
        <p>The sidebar on the right side of the Calendar shows:</p>
        <ul>
          <li><strong>This Week</strong> — how many assignments are due this week</li>
          <li><strong>Due Today</strong> — assignments due today (shown in red)</li>
          <li><strong>Missing</strong> — overdue assignments (shown in red)</li>
        </ul>

        <h3>Bell notifications</h3>
        <p>Click the 🔔 bell icon in the calendar header to see detailed assignment notifications
        and reminders sorted by due date.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Turn on <strong>Auto-sync</strong> in the Canvas panel to keep
          your calendar updated automatically every time you visit the hub.
        </div>
      `
    },
  ],

  'chatbot': [
    {
      id: 'chatbot-guide',
      icon: '🤖',
      title: 'Getting the Most From the AI Chatbot',
      blurb: 'Questions, file search, videos, and more',
      searchText: 'chatbot AI ask question file search YouTube video help',
      content: `
        <p>Your YSC Academy AI assistant is connected to Canvas, Slack, Google Drive, and the internet —
        so it can give you personalized answers about your schoolwork.</p>

        <h3>Things you can ask</h3>
        <ul>
          <li><strong>Assignments</strong> — "What's due tomorrow?" / "Do I have any missing work?"</li>
          <li><strong>Files</strong> — "Find my biology notes in Drive" / "Open the shared rubric from Mr. Smith"</li>
          <li><strong>Grades</strong> — "What's my current grade in Math?" / "Which class am I missing points in?"</li>
          <li><strong>Videos</strong> — "Show me a video explaining mitosis" / "Find a Khan Academy video on fractions"</li>
          <li><strong>Announcements</strong> — "What announcements did teachers post today?"</li>
          <li><strong>Calendar</strong> — "Add all my Canvas assignments to my calendar"</li>
        </ul>

        <h3>Quick suggestion chips</h3>
        <p>Below the chat input you'll find suggestion chips with common questions. Click any chip
        to send that question instantly without typing.</p>

        <h3>Conversation memory</h3>
        <p>The chatbot remembers what you said earlier in the conversation. You can ask follow-up
        questions like "Tell me more" or "Find another one" and it will understand the context.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> The more specific your question, the better the answer.
          Instead of "find my file," try "find the Google Doc I wrote about Romeo and Juliet."
        </div>
      `
    },
  ],

  'zoom': [
    {
      id: 'zoom-guide',
      icon: '🎥',
      title: 'Using Zoom on Your Hub',
      blurb: 'Join meetings and save your Zoom links',
      searchText: 'zoom join meeting link save school personal video call',
      content: `
        <p>The Zoom panel makes it easy to join class video calls and save your Zoom links
        so they are always one click away.</p>

        <h3>Joining a meeting</h3>
        <ol class="help-step-list">
          <li>Click the <strong>🎥 Join Zoom</strong> button in the top navigation bar.</li>
          <li>The Zoom panel will open from the side.</li>
          <li>Find your meeting in the <strong>School Meetings</strong> list and click <strong>Join</strong>.</li>
        </ol>

        <h3>Adding a school meeting link</h3>
        <ol class="help-step-list">
          <li>Open the Zoom panel by clicking <strong>Join Zoom</strong>.</li>
          <li>Click <strong>+ Add</strong> next to School Meetings.</li>
          <li>Enter the meeting name, Zoom URL, and the time (e.g., "Mon–Fri · 8:30 AM").</li>
          <li>Click <strong>Save Link</strong>.</li>
        </ol>

        <h3>Adding a personal Zoom link</h3>
        <p>You can also save your own personal Zoom room or any meeting link in the
        <strong>My Personal Links</strong> section using the same process.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Save your homeroom Zoom link so it is always at the top of
          your list — ready to join in one click every morning.
        </div>
      `
    },
  ],

  'grades': [
    {
      id: 'grades-guide',
      icon: '📊',
      title: 'Understanding the Grades Widget',
      blurb: 'View your GPA and per-course grades',
      searchText: 'grades GPA course score percentage missing count',
      content: `
        <p>The Grades panel gives you a live view of your academic performance pulled directly
        from Canvas — no manual entry needed.</p>

        <h3>What you will see</h3>
        <ul>
          <li><strong>GPA</strong> — Your overall grade point average calculated from all active courses</li>
          <li><strong>Courses</strong> — The number of active courses you are enrolled in</li>
          <li><strong>Missing</strong> — The number of past-due assignments you have not submitted</li>
        </ul>

        <h3>Per-course grades</h3>
        <p>Below the summary, you will see each course with its current grade percentage and letter grade.
        Courses are color-coded:</p>
        <ul>
          <li><strong>Green</strong> — A or B (strong performance)</li>
          <li><strong>Yellow</strong> — C (needs attention)</li>
          <li><strong>Red</strong> — D or F (needs immediate attention)</li>
        </ul>

        <h3>Refreshing grades</h3>
        <p>Click the <strong>↻ refresh button</strong> in the Grades panel header to pull the
        latest grade data from Canvas.</p>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Ask the AI Chatbot "What is my lowest grade right now?" for
          a quick summary of where you might need to focus.
        </div>
      `
    },
  ],

  'photos': [
    {
      id: 'panel-decor',
      icon: '✨',
      title: 'Decorating Your Panels',
      blurb: 'Stickers, borders, and custom panel titles',
      searchText: 'decorate panel sticker border rename title custom style',
      content: `
        <p>See the <strong>Decorating Panels</strong> article in <em>Personalizing Your Hub</em>
        for full instructions.</p>

        <h3>Quick summary</h3>
        <ul>
          <li>Open <strong>⚙️ Settings → ✨ Decorate</strong></li>
          <li>Select which panel to customize</li>
          <li>Add a sticker emoji next to the panel title</li>
          <li>Choose a custom border style</li>
          <li>Rename any panel with your own personal title</li>
        </ul>
      `
    },
  ],

  'settings': [
    {
      id: 'settings-overview',
      icon: '⚙️',
      title: 'Overview of Settings',
      blurb: 'Everything you can customize from the Settings panel',
      searchText: 'settings gear customize overview tabs layout font color background decorate quotes',
      content: `
        <p>The Settings panel is your personalization control center. Open it by clicking the
        <strong>⚙️ gear icon</strong> in the top navigation bar.</p>

        <h3>Settings tabs</h3>
        <ul>
          <li><strong>🗂️ Layout</strong> — Show or hide panels, reset to default layout</li>
          <li><strong>🔤 Fonts</strong> — Choose font family and text size</li>
          <li><strong>🎨 Colors</strong> — Preset themes, custom colors, dark mode, share theme code</li>
          <li><strong>🖼️ BG</strong> — Background photo presets or upload your own, opacity slider</li>
          <li><strong>✨ Decorate</strong> — Panel stickers, borders, and custom titles</li>
          <li><strong>📸 Photos</strong> — Upload your profile photo and banner image</li>
          <li><strong>💬 Quotes</strong> — Enable the daily inspirational quote widget</li>
        </ul>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> All settings save automatically when you make a change.
          There is no Save button needed — just click and it is done.
        </div>
      `
    },
  ],

  'troubleshooting': [
    {
      id: 'canvas-not-loading',
      icon: '⚠️',
      title: 'Canvas Is Not Loading',
      blurb: 'Fix issues with the Canvas panel',
      searchText: 'canvas loading error not working assignments not showing blank',
      content: `
        <p>If your Canvas panel is showing an error, loading forever, or appearing blank, try these steps:</p>

        <h3>Steps to try</h3>
        <ol class="help-step-list">
          <li>Click the <strong>↻ refresh button</strong> in the Canvas panel header to retry.</li>
          <li>Refresh the entire page (Cmd+R / Ctrl+R).</li>
          <li>Check that you are connected to the internet.</li>
          <li>Try switching between Hub View and Classic View and back.</li>
          <li>If it still does not load after a minute, tell your teacher — it may be a Canvas server issue.</li>
        </ol>

        <div class="help-tip-box">
          <strong>💡 Tip:</strong> Canvas data loads in the background. If you just opened the hub,
          give it 10–15 seconds before refreshing.
        </div>
      `
    },
    {
      id: 'drive-not-connecting',
      icon: '📁',
      title: 'Google Drive Is Not Connecting',
      blurb: 'Fix issues connecting or viewing Drive files',
      searchText: 'google drive not connecting sign in auth error files not showing',
      content: `
        <p>If your Google Drive panel is asking you to connect or not showing your files, try these steps:</p>

        <h3>Steps to try</h3>
        <ol class="help-step-list">
          <li>Click the <strong>Connect Drive</strong> button in the top navigation bar and sign in with your YSC Google account.</li>
          <li>Make sure you are signing in with your <strong>school email</strong> (ending in @example.edu), not a personal Gmail.</li>
          <li>After signing in, refresh the page (Cmd+R / Ctrl+R).</li>
          <li>Click the <strong>↻ refresh button</strong> in the Drive panel to reload your files.</li>
          <li>If you still see an error, sign out and sign back in again.</li>
        </ol>
      `
    },
    {
      id: 'common-issues',
      icon: '🛠️',
      title: 'Common Issues & Fixes',
      blurb: 'Quick answers to the most frequent problems',
      searchText: 'problem issue fix not working error common slow broken layout reset',
      content: `
        <h3>My layout is messed up</h3>
        <p>Open <strong>⚙️ Settings → 🗂️ Layout</strong> and click <strong>Reset to Default Layout</strong>.
        This restores the original panel arrangement.</p>

        <h3>The chatbot is not responding</h3>
        <p>Try refreshing the page and asking again. If the chatbot is slow, it may be processing a
        complex request — give it a few extra seconds.</p>

        <h3>Slack is not loading messages</h3>
        <p>Click the <strong>↻ refresh button</strong> in the Slack panel header.
        If channels appear but messages do not load, click a different channel and back.</p>

        <h3>The hub is loading very slowly</h3>
        <p>The hub loads several services at once. If your internet connection is slow, some panels
        may take 15–30 seconds to fill in. Wait a moment before refreshing.</p>

        <h3>I cannot find a setting I need</h3>
        <p>Use the <strong>search bar</strong> at the top of this Help Center to search for any topic.
        Or browse through <em>Personalizing Your Hub</em> and <em>Settings</em> in the sidebar.</p>
      `
    },
  ],
};

const QUICK_TIPS = [
  { star: '⭐', text: 'Want your day waiting for you? Ask the AI Assistant to Slack you a morning message with what’s due and what’s on your schedule — you pick the time.' },
  { star: '⭐', text: 'Ask the chatbot to find any file in your Google Drive — just say "Find my essay about..."' },
  { star: '⭐', text: 'Try asking the chatbot to add all your Canvas assignments to your calendar automatically.' },
  { star: '⭐', text: 'Home is your starting point — the assistant already knows what’s due and whether your mentor’s online. Just start typing.' },
  { star: '⭐', text: 'Share your theme code with friends so you can have perfectly matching hubs!' },
  { star: '⭐', text: 'The chatbot can find YouTube videos on any subject — just ask for a video about your topic.' },
  { star: '⭐', text: 'Your Team tab has your support people and your sport schedule — you can add your own practices and games there. The 💬 Mentor Chat tab is where you message your mentor.' },
];

const TOUR_STEPS = [
  {
    selector: '.brand',
    title: 'YSC Academy Student Hub',
    text: 'Welcome to your personalized academic workspace! Everything you need for school is in one place — Canvas, Slack, Drive, Calendar, Grades, and your AI assistant.',
  },
  {
    selector: '.htv-tab[data-tab="home"]',
    title: '🏠 Home — start here',
    text: 'You land on Home every time you log in. It’s your AI assistant, and it already knows what’s due and whether your mentor is online. Ask it anything.',
  },
  {
    selector: '.htv-nav',
    title: 'Your tabs',
    text: 'Home, 📅 Today (mentor message, sport schedule, Mentor Chat), 📈 Growth (goals + grades), 👥 Your Team (your support team + your sport schedule, where you can add your own practices and games), and 🎥 Virtual Meetings. On a phone, Meetings is under "More".',
  },
  {
    selector: '.classic-sidebar',
    title: '📂 Tools sidebar',
    text: 'Icons for Canvas, Slack, Google Drive, Calendar, and Grades — click one to open it over the current view, then "← Back" to return. On a phone this is the "More" menu.',
  },
  {
    selector: '#help-btn',
    title: '? Help Center',
    text: 'Click the Help button anytime you have a question. The Help Center has guides for every feature, an interactive tour, and a search bar.',
  },
];

// ── State ──────────────────────────────────────────────────────────────────

let helpOpen = false;
let currentCategory = 'getting-started';
let currentArticle = null;
let searchQuery = '';
let tourStep = -1;
let tourDimEl = null;
let tourSpotEl = null;
let tourTipEl = null;

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildOverlayHTML();
  attachEvents();
});

function buildOverlayHTML() {
  const overlay = document.createElement('div');
  overlay.id = 'help-overlay';
  overlay.className = 'help-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="help-backdrop" id="help-backdrop"></div>
    <div class="help-panel" role="dialog" aria-modal="true" aria-label="Help Center">
      <div class="help-panel-head">
        <div class="help-head-top">
          <img src="/logo.jpg" alt="YSC Academy" class="help-head-logo" />
          <div>
            <div class="help-head-title">Help Center</div>
            <div class="help-head-subtitle">YSC Academy Student Hub</div>
          </div>
          <button class="help-close-btn" id="help-close-btn" title="Close">✕</button>
        </div>
        <div class="help-search-row">
          <div class="help-search-wrap">
            <span class="help-search-icon">🔍</span>
            <input type="text" id="help-search-input" class="help-search-input"
                   placeholder="Search for help topics…" autocomplete="off" />
          </div>
          <button class="help-tour-btn" id="help-start-tour">▶ Start Tour</button>
        </div>
      </div>
      <div class="help-body">
        <nav class="help-sidebar" id="help-sidebar" aria-label="Help categories"></nav>
        <div class="help-content" id="help-content"></div>
      </div>
      <div class="help-footer">
        <div class="help-footer-label">💡 Quick Tips</div>
        <div class="help-tips-row" id="help-tips-row"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  buildSidebar();
  buildTips();
  showCategory('getting-started');
}

function buildSidebar() {
  const nav = document.getElementById('help-sidebar');
  nav.innerHTML = '<div class="help-sidebar-section-label">Browse Topics</div>';
  HELP_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'help-cat-btn';
    btn.dataset.cat = cat.id;
    btn.innerHTML = `<span class="help-cat-icon">${cat.icon}</span>${escHtml(cat.label)}`;
    btn.addEventListener('click', () => {
      searchQuery = '';
      document.getElementById('help-search-input').value = '';
      currentArticle = null;
      showCategory(cat.id);
    });
    nav.appendChild(btn);
  });
}

function buildTips() {
  const row = document.getElementById('help-tips-row');
  row.innerHTML = '';
  QUICK_TIPS.forEach(tip => {
    const el = document.createElement('div');
    el.className = 'help-tip-pill';
    el.innerHTML = `<span class="tip-star">${tip.star}</span>${escHtml(tip.text)}`;
    row.appendChild(el);
  });
}

// ── Events ─────────────────────────────────────────────────────────────────

function attachEvents() {
  document.getElementById('help-backdrop')?.addEventListener('click', closeHelp);
  document.getElementById('help-close-btn')?.addEventListener('click', closeHelp);
  document.getElementById('help-start-tour')?.addEventListener('click', () => { closeHelp(); startTour(); });

  document.getElementById('help-search-input')?.addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    currentArticle = null;
    if (searchQuery) {
      renderSearch(searchQuery);
    } else {
      showCategory(currentCategory);
    }
  });

  document.getElementById('help-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value = ''; searchQuery = ''; showCategory(currentCategory); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (tourStep >= 0) { endTour(); return; }
      if (helpOpen) closeHelp();
    }
  });
}

// ── Open / Close ───────────────────────────────────────────────────────────

function openHelp(categoryId, articleId) {
  helpOpen = true;
  const overlay = document.getElementById('help-overlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  if (categoryId) {
    currentCategory = categoryId;
    currentArticle = articleId || null;
  }

  if (currentArticle) {
    showArticle(currentCategory, currentArticle);
  } else {
    showCategory(currentCategory);
  }

  document.getElementById('help-search-input')?.focus();
}

function closeHelp() {
  helpOpen = false;
  const overlay = document.getElementById('help-overlay');
  overlay.style.display = 'none';
}

// ── Category / Article Views ───────────────────────────────────────────────

function showCategory(catId) {
  currentCategory = catId;
  currentArticle = null;

  // Update sidebar active state
  document.querySelectorAll('.help-cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === catId);
  });

  const cat = HELP_CATEGORIES.find(c => c.id === catId);
  const articles = HELP_ARTICLES[catId] || [];

  const content = document.getElementById('help-content');
  content.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'help-cat-view';
  view.innerHTML = `
    <div class="help-cat-view-title">${cat?.icon || ''} ${escHtml(cat?.label || catId)}</div>
    <div class="help-cat-view-desc">${categoryDesc(catId)}</div>
    <div class="help-article-cards" id="article-cards"></div>`;
  content.appendChild(view);

  const cards = document.getElementById('article-cards');
  articles.forEach(art => {
    const card = document.createElement('button');
    card.className = 'help-article-card';
    card.innerHTML = `
      <div class="help-article-card-icon">${art.icon}</div>
      <div class="help-article-card-text">
        <div class="help-article-card-title">${escHtml(art.title)}</div>
        <div class="help-article-card-blurb">${escHtml(art.blurb)}</div>
      </div>
      <div class="help-article-card-arrow">›</div>`;
    card.addEventListener('click', () => showArticle(catId, art.id));
    cards.appendChild(card);
  });
}

function showArticle(catId, artId) {
  currentCategory = catId;
  currentArticle = artId;

  const cat = HELP_CATEGORIES.find(c => c.id === catId);
  const art = (HELP_ARTICLES[catId] || []).find(a => a.id === artId);
  if (!art) { showCategory(catId); return; }

  const content = document.getElementById('help-content');
  content.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'help-article-view';
  view.innerHTML = `
    <button class="help-article-back" id="help-art-back">← Back to ${escHtml(cat?.label || catId)}</button>
    <div class="help-article-heading">${escHtml(art.title)}</div>
    <span class="help-article-cat-label">${cat?.icon || ''} ${escHtml(cat?.label || catId)}</span>
    <div class="help-article-body">${art.content}</div>`;
  content.appendChild(view);
  content.scrollTop = 0;

  document.getElementById('help-art-back')?.addEventListener('click', () => showCategory(catId));
}

// ── Search ─────────────────────────────────────────────────────────────────

function renderSearch(query) {
  const q = query.toLowerCase();
  const results = [];

  HELP_CATEGORIES.forEach(cat => {
    const articles = HELP_ARTICLES[cat.id] || [];
    articles.forEach(art => {
      const titleMatch = art.title.toLowerCase().includes(q);
      const blurbMatch = art.blurb.toLowerCase().includes(q);
      const searchMatch = (art.searchText || '').toLowerCase().includes(q);
      const contentMatch = art.content.toLowerCase().includes(q);
      if (titleMatch || blurbMatch || searchMatch || contentMatch) {
        results.push({ cat, art, titleMatch, blurbMatch });
      }
    });
  });

  const content = document.getElementById('help-content');
  content.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'help-search-view';

  if (!results.length) {
    view.innerHTML = `
      <div class="help-search-view-title">No results for "<span>${escHtml(query)}</span>"</div>
      <div class="help-no-results">
        <div class="help-no-results-icon">🔍</div>
        <p>No help articles matched your search.<br>Try different keywords or browse a category from the left sidebar.</p>
      </div>`;
  } else {
    view.innerHTML = `<div class="help-search-view-title">${results.length} result${results.length === 1 ? '' : 's'} for "<span>${escHtml(query)}</span>"</div>`;
    results.forEach(({ cat, art }) => {
      const card = document.createElement('div');
      card.className = 'help-search-result';
      card.innerHTML = `
        <div class="help-search-result-icon">${art.icon}</div>
        <div class="help-search-result-body">
          <div class="help-search-result-cat">${cat.icon} ${escHtml(cat.label)}</div>
          <div class="help-search-result-title">${highlightMatch(art.title, query)}</div>
          <div class="help-search-result-blurb">${escHtml(art.blurb)}</div>
        </div>`;
      card.addEventListener('click', () => {
        searchQuery = '';
        document.getElementById('help-search-input').value = '';
        showArticle(cat.id, art.id);
      });
      view.appendChild(card);
    });
  }

  content.appendChild(view);
}

function highlightMatch(text, query) {
  const escaped = escHtml(text);
  const qEsc = escHtml(query);
  const idx = escaped.toLowerCase().indexOf(qEsc.toLowerCase());
  if (idx < 0) return escaped;
  return escaped.slice(0, idx) +
    `<mark>${escaped.slice(idx, idx + qEsc.length)}</mark>` +
    escaped.slice(idx + qEsc.length);
}

// ── Tour ───────────────────────────────────────────────────────────────────

function startTour() {
  // Build tour DOM elements if needed
  if (!tourDimEl) {
    tourDimEl = document.createElement('div');
    tourDimEl.className = 'tour-dim';
    tourDimEl.style.display = 'none';
    document.body.appendChild(tourDimEl);
  }
  if (!tourSpotEl) {
    tourSpotEl = document.createElement('div');
    tourSpotEl.className = 'tour-spotlight';
    tourSpotEl.style.display = 'none';
    document.body.appendChild(tourSpotEl);
  }
  if (!tourTipEl) {
    tourTipEl = document.createElement('div');
    tourTipEl.className = 'tour-tooltip';
    tourTipEl.style.display = 'none';
    tourTipEl.innerHTML = `
      <div class="tour-tooltip-step" id="tour-step-label">STEP 1 OF ${TOUR_STEPS.length}</div>
      <div class="tour-tooltip-title" id="tour-tip-title"></div>
      <div class="tour-tooltip-text" id="tour-tip-text"></div>
      <div class="tour-nav-row">
        <button class="tour-nav-btn" id="tour-prev-btn">← Prev</button>
        <span class="tour-progress" id="tour-prog"></span>
        <button class="tour-nav-btn" id="tour-next-btn">Next →</button>
      </div>
      <button class="tour-skip-btn" id="tour-skip-btn">Skip Tour</button>`;
    document.body.appendChild(tourTipEl);

    document.getElementById('tour-prev-btn')?.addEventListener('click', () => goTourStep(tourStep - 1));
    document.getElementById('tour-next-btn')?.addEventListener('click', () => goTourStep(tourStep + 1));
    document.getElementById('tour-skip-btn')?.addEventListener('click', endTour);
  }

  tourDimEl.style.display = 'block';
  tourSpotEl.style.display = 'block';
  tourTipEl.style.display = 'block';
  goTourStep(0);
}

function goTourStep(step) {
  if (step < 0) step = 0;
  if (step >= TOUR_STEPS.length) { endTour(); return; }
  tourStep = step;

  const s = TOUR_STEPS[step];
  let target = document.querySelector(s.selector);
  if (!target && s.fallbackSelector) target = document.querySelector(s.fallbackSelector);

  document.getElementById('tour-step-label').textContent = `STEP ${step + 1} OF ${TOUR_STEPS.length}`;
  document.getElementById('tour-tip-title').textContent = s.title;
  document.getElementById('tour-tip-text').textContent = s.text;
  document.getElementById('tour-prog').textContent = `${step + 1} / ${TOUR_STEPS.length}`;
  document.getElementById('tour-prev-btn').disabled = step === 0;
  document.getElementById('tour-next-btn').textContent = step === TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next →';

  if (target) {
    const rect = target.getBoundingClientRect();
    const pad = 8;
    tourSpotEl.style.cssText = `
      display: block;
      left: ${rect.left - pad}px;
      top: ${rect.top - pad}px;
      width: ${rect.width + pad * 2}px;
      height: ${rect.height + pad * 2}px;
      box-shadow: 0 0 0 9999px rgba(0,0,0,.7);
      border-radius: 10px;
      z-index: 9800;
      pointer-events: none;
      outline: 3px solid rgba(232,160,32,.9);
      outline-offset: 3px;
      position: fixed;
      transition: left .35s ease, top .35s ease, width .35s ease, height .35s ease;`;

    // Position tooltip below or above the target
    const tipW = 300, tipH = 200;
    const vw = window.innerWidth, vh = window.innerHeight;
    let tipLeft = rect.left;
    let tipTop = rect.bottom + pad + 16;
    let arrowClass = 'arrow-top';

    if (tipTop + tipH > vh - 20) {
      tipTop = rect.top - tipH - pad - 16;
      arrowClass = 'arrow-bottom';
    }
    tipLeft = Math.max(12, Math.min(tipLeft, vw - tipW - 12));

    tourTipEl.className = `tour-tooltip ${arrowClass}`;
    tourTipEl.style.cssText = `
      display: block;
      left: ${tipLeft}px;
      top: ${tipTop}px;
      width: ${tipW}px;
      z-index: 9900;
      position: fixed;`;
  } else {
    // Fallback: center of screen
    tourSpotEl.style.display = 'none';
    tourTipEl.style.cssText = `
      display: block;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      z-index: 9900;
      position: fixed;`;
  }
}

function endTour() {
  tourStep = -1;
  if (tourDimEl) tourDimEl.style.display = 'none';
  if (tourSpotEl) tourSpotEl.style.display = 'none';
  if (tourTipEl) tourTipEl.style.display = 'none';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function categoryDesc(catId) {
  const descs = {
    'getting-started':  'New here? Start with these guides to understand your hub and get up and running quickly.',
    'personalizing':    'Make the hub truly yours — change fonts, colors, backgrounds, add photos, and rearrange everything.',
    'canvas':           'Everything you need to know about using Canvas assignments, grades, and announcements.',
    'slack':            'How to read messages, browse channels, send messages, and manage direct messages.',
    'drive':            'Connect your Google account and browse your Drive files right from the hub.',
    'calendar':         'View upcoming deadlines, sync Canvas assignments, and manage events on your calendar.',
    'chatbot':          'Get the most out of your AI assistant — ask questions, search files, and find videos.',
    'zoom':             'Join class video meetings and save your Zoom links for quick access.',
    'grades':           'Understand your GPA widget and per-course grade display.',
    'photos':           'Upload your profile photo and banner image to personalize your hub.',
    'settings':         'Overview of every settings tab and what each one lets you customize.',
    'troubleshooting':  'Something not working? Find quick fixes for the most common issues here.',
  };
  return descs[catId] || '';
}

// ── Public API ─────────────────────────────────────────────────────────────
window.openHelp = openHelp;
window.closeHelp = closeHelp;
