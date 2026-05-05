# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> Login Page Tests >> should show error for empty credentials
- Location: tests\login.spec.ts:18:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('#identifier')
    - waiting for" http://localhost:4200/171E92C18EEE40A29D1749C505091DFC_SOPHOS_WARN_PROCEEDED_FLAG" navigation to finish...
    - waiting for" http://localhost:4200/" navigation to finish...
    - navigated to "http://localhost:4200/"

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - navigation [ref=e6]:
      - generic [ref=e7]:
        - link "OurPGTracker" [ref=e9] [cursor=pointer]:
          - generic [ref=e10]: OurPGTracker
        - generic [ref=e12]:
          - button "About" [ref=e13] [cursor=pointer]
          - button "Benefits" [ref=e14] [cursor=pointer]
          - button "Features" [ref=e15] [cursor=pointer]
          - button "How It Works" [ref=e16] [cursor=pointer]
          - button "Contact Us" [ref=e17] [cursor=pointer]
        - generic [ref=e18]:
          - generic [ref=e20]:
            - generic [ref=e21]:
              - paragraph [ref=e22]: Appearance
              - paragraph [ref=e23]: Light
            - switch "Toggle dark mode" [ref=e24] [cursor=pointer]
          - button "Sign in" [ref=e26] [cursor=pointer]: Sign in
          - link "Start Free" [ref=e28] [cursor=pointer]:
            - /url: /login?mode=signup
    - generic [ref=e30]:
      - generic [ref=e31]:
        - paragraph [ref=e32]: Built for PG & Hostel Owners
        - heading "Our PG Tracker – Manage PG Rooms, Rent & Tenants Easily" [level=1] [ref=e33]
        - paragraph [ref=e34]: Our PG Tracker is a simple PG management software that helps owners track rent, manage tenants, assign rooms and beds, and monitor monthly earnings — all in one clear dashboard.
        - generic [ref=e35]:
          - link "Start Free" [ref=e36] [cursor=pointer]:
            - /url: /login?mode=signup
          - button "Request Demo" [ref=e37] [cursor=pointer]
      - generic [ref=e38]:
        - paragraph [ref=e39]: Live Snapshot
        - generic [ref=e40]:
          - generic [ref=e41]:
            - paragraph [ref=e42]: Total Members
            - paragraph [ref=e43]: 1,280
          - generic [ref=e44]:
            - paragraph [ref=e45]: Monthly Earnings
            - paragraph [ref=e46]: ₹4.2L
          - generic [ref=e47]:
            - paragraph [ref=e48]: Occupied Beds
            - paragraph [ref=e49]: "96"
          - generic [ref=e50]:
            - paragraph [ref=e51]: Pending Dues
            - paragraph [ref=e52]: "34"
    - region "About Our PG Tracker" [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]:
          - paragraph [ref=e56]: About
          - heading "About Our PG Tracker" [level=2] [ref=e57]
          - paragraph [ref=e58]:
            - strong [ref=e59]: Our PG Tracker
            - text: is an easy-to-use PG management software built for owners of paying-guest accommodations, hostels, and co-living properties. It brings rent tracking, tenant management, and room & bed allotment into a single, clean dashboard so you can run daily operations without spreadsheets or paperwork.
        - generic [ref=e60]:
          - generic [ref=e61]:
            - paragraph [ref=e62]: Who it's for
            - paragraph [ref=e63]: PG owners, hostel managers, and co-living operators who want a simple way to track rent and tenants.
          - generic [ref=e64]:
            - paragraph [ref=e65]: Key benefits
            - list [ref=e66]:
              - listitem [ref=e67]: Rent tracking with pending & overdue alerts
              - listitem [ref=e68]: Tenant management with full payment history
              - listitem [ref=e69]: Live room & bed occupancy view
              - listitem [ref=e70]: Monthly earnings & growth insights
    - generic [ref=e71]:
      - generic [ref=e72]:
        - heading "Why owners choose Our PG Tracker" [level=2] [ref=e73]
        - paragraph [ref=e74]: Quickly understand what you get as a PG or hostel owner.
      - generic [ref=e75]:
        - article [ref=e76]:
          - heading "Track Payments & Dues Easily" [level=3] [ref=e79]
        - article [ref=e80]:
          - heading "Manage Rooms & Beds" [level=3] [ref=e83]
        - article [ref=e84]:
          - heading "Handle All Members in One Place" [level=3] [ref=e87]
        - article [ref=e88]:
          - heading "Monitor Earnings & Growth" [level=3] [ref=e91]
    - generic [ref=e92]:
      - generic [ref=e93]:
        - heading "Everything Our PG Tracker offers" [level=2] [ref=e94]
        - paragraph [ref=e95]: Rent, tenants, rooms and reports — grouped for easy day-to-day PG operations.
      - generic [ref=e96]:
        - article [ref=e97]:
          - heading "Payments & Dues Management" [level=3] [ref=e100]
          - list [ref=e101]:
            - listitem [ref=e102]: Track pending, overdue, and due-soon payments
            - listitem [ref=e103]: Support for partial payments
            - listitem [ref=e104]: Payment history per member
            - listitem [ref=e105]: Multiple payment methods (cash / UPI / card)
            - listitem [ref=e106]: Export payment reports
          - paragraph [ref=e107]: Never miss a payment — track every rupee with full clarity.
        - article [ref=e108]:
          - heading "Room & Bed Management" [level=3] [ref=e111]
          - list [ref=e112]:
            - listitem [ref=e113]: Create floors, rooms, and beds
            - listitem [ref=e114]: Visual bed occupancy (occupied vs vacant)
            - listitem [ref=e115]: Assign beds to members easily
            - listitem [ref=e116]: Prevent double booking
            - listitem [ref=e117]: Track available beds instantly
          - paragraph [ref=e118]: Know exactly which beds are filled and available at any time.
        - article [ref=e119]:
          - heading "Member Management" [level=3] [ref=e122]
          - list [ref=e123]:
            - listitem [ref=e124]: Add, edit, delete members
            - listitem [ref=e125]: View active/inactive members
            - listitem [ref=e126]: Member profile with full payment history
            - listitem [ref=e127]: Search, filter, and sort members
            - listitem [ref=e128]: Quick contact actions (call / WhatsApp)
          - paragraph [ref=e129]: Manage all your tenants with complete records in one place.
        - article [ref=e130]:
          - heading "Dashboard & Insights" [level=3] [ref=e133]
          - list [ref=e134]:
            - listitem [ref=e135]: Real-time dashboard (members, dues, earnings)
            - listitem [ref=e136]: Monthly earnings tracking
            - listitem [ref=e137]: Due today / overdue insights
            - listitem [ref=e138]: Reports and export options
          - paragraph [ref=e139]: Get complete visibility of your PG performance instantly.
        - article [ref=e140]:
          - heading "Bulk Import & Setup" [level=3] [ref=e143]
          - list [ref=e144]:
            - listitem [ref=e145]: Upload members via Excel/CSV
            - listitem [ref=e146]: Auto validation and error handling
            - listitem [ref=e147]: Seat assignment validation
          - paragraph [ref=e148]: Add all your tenants in minutes — no manual work.
        - article [ref=e149]:
          - heading "Smart Reminders & Actions" [level=3] [ref=e152]
          - list [ref=e153]:
            - listitem [ref=e154]: Send payment reminders instantly
            - listitem [ref=e155]: WhatsApp / call integration
            - listitem [ref=e156]: Quick actions for daily tasks
          - paragraph [ref=e157]: Reduce late payments with instant reminders.
        - article [ref=e158]:
          - heading "Secure Access & Control" [level=3] [ref=e161]
          - list [ref=e162]:
            - listitem [ref=e163]: Secure login (email/mobile)
            - listitem [ref=e164]: Account status handling
            - listitem [ref=e165]: Protected owner access
          - paragraph [ref=e166]: Your data is safe and accessible only to you.
    - generic [ref=e167]:
      - heading "How Our PG Tracker works" [level=2] [ref=e168]
      - paragraph [ref=e169]: Get started in three simple steps and start managing your PG, tenants and rent from day one.
      - generic [ref=e170]:
        - article [ref=e171]:
          - paragraph [ref=e172]: Step 1
          - heading "Set up your PG" [level=3] [ref=e173]
          - paragraph [ref=e174]: Configure floors, rooms, and beds as per your property setup.
        - article [ref=e175]:
          - paragraph [ref=e176]: Step 2
          - heading "Add tenants" [level=3] [ref=e177]
          - paragraph [ref=e178]: Add tenant details and assign beds in just a few clicks.
        - article [ref=e179]:
          - paragraph [ref=e180]: Step 3
          - heading "Track rent & earnings" [level=3] [ref=e181]
          - paragraph [ref=e182]: Monitor rent payments, pending dues, and monthly growth from your dashboard.
    - generic [ref=e183]:
      - heading "Start managing your PG digitally with Our PG Tracker." [level=2] [ref=e184]
      - paragraph [ref=e185]: Faster rent collection, clearer tenant records, and one dashboard for every room.
      - generic [ref=e186]:
        - link "Start Free" [ref=e187] [cursor=pointer]:
          - /url: /login?mode=signup
        - button "Contact / Demo" [ref=e188] [cursor=pointer]
    - generic [ref=e189]:
      - generic [ref=e190]:
        - heading "Request Demo" [level=2] [ref=e191]
        - paragraph [ref=e192]: Fill details and send directly on WhatsApp.
      - generic [ref=e193]:
        - generic [ref=e194]:
          - generic [ref=e195]: Name
          - textbox "Name" [ref=e196]:
            - /placeholder: Enter your name
        - generic [ref=e197]:
          - generic [ref=e198]: Business Type
          - combobox "Business Type" [ref=e199]:
            - option "PG" [selected]
            - option "Hostel"
            - option "Other"
        - generic [ref=e200]:
          - generic [ref=e201]: Address
          - textbox "Address" [ref=e202]:
            - /placeholder: Enter your address
        - generic [ref=e203]:
          - generic [ref=e204]: Email
          - textbox "Email" [ref=e205]:
            - /placeholder: Enter your email
        - generic [ref=e206]:
          - generic [ref=e207]: Mobile
          - textbox "Mobile" [ref=e208]:
            - /placeholder: Enter 10-digit mobile number
        - generic [ref=e209]:
          - button "General WhatsApp" [ref=e210] [cursor=pointer]
          - button "Send Demo Request" [disabled] [ref=e211]
    - region "See Our PG Tracker in action" [ref=e212]:
      - generic [ref=e213]:
        - heading "See Our PG Tracker in action" [level=2] [ref=e214]
        - paragraph [ref=e215]: A quick tour of the owner app — rooms, rent collections, tenants, and insights in one place.
      - generic [ref=e216]:
        - generic [ref=e217]:
          - img "Our PG Tracker — dashboard and room overview" [ref=e220]
          - img "Payment tracking and collection tools" [ref=e223]
          - img "Room and bed management" [ref=e226]
          - img "Member and tenant management" [ref=e229]
          - img "Due dates and reminders" [ref=e232]
          - img "Reports and monthly earnings" [ref=e235]
          - img "Import members from spreadsheet" [ref=e238]
          - img "Get started with Our PG Tracker" [ref=e241]
        - button "Previous slide" [ref=e242] [cursor=pointer]
        - button "Next slide" [ref=e244] [cursor=pointer]
      - tablist "Choose slide" [ref=e246]:
        - tab "Slide 1" [ref=e247] [cursor=pointer]
        - tab "Slide 2" [ref=e248] [cursor=pointer]
        - tab "Slide 3" [selected] [ref=e249] [cursor=pointer]
        - tab "Slide 4" [ref=e250] [cursor=pointer]
        - tab "Slide 5" [ref=e251] [cursor=pointer]
        - tab "Slide 6" [ref=e252] [cursor=pointer]
        - tab "Slide 7" [ref=e253] [cursor=pointer]
        - tab "Slide 8" [ref=e254] [cursor=pointer]
    - contentinfo [ref=e255]: © 2026 Our PG Tracker — PG management, rent tracking & tenant management made simple. v-03/04 v1.0.7
  - button "Contact on WhatsApp" [ref=e256] [cursor=pointer]:
    - generic [ref=e258]: WhatsApp
```

# Test source

```ts
  1  | import { Page, expect } from '@playwright/test';
  2  | import { loginSelectors } from '../fixtures/test-data';
  3  | 
  4  | export class LoginPage {
  5  |   constructor(private page: Page) {}
  6  | 
  7  |   async goto() {
  8  |     await this.page.goto('/');
  9  |   }
  10 | 
  11 |   async fillLoginForm(identifier: string, password: string) {
> 12 |     await this.page.fill(loginSelectors.identifierInput, identifier);
     |                     ^ Error: page.fill: Test timeout of 60000ms exceeded.
  13 |     await this.page.fill(loginSelectors.passwordInput, password);
  14 |   }
  15 | 
  16 |   async clickSignInButton() {
  17 |     await this.page.click(loginSelectors.signInButton);
  18 |   }
  19 | 
  20 |   async login(identifier: string, password: string) {
  21 |     await this.fillLoginForm(identifier, password);
  22 |     await this.clickSignInButton();
  23 |   }
  24 | 
  25 |   async getErrorMessage() {
  26 |     return this.page.textContent(loginSelectors.errorMessage);
  27 |   }
  28 | 
  29 |   async waitForLoginSuccess() {
  30 |     // Wait for navigation to dashboard or any successful login indicator
  31 |     await this.page.waitForURL('**/dashboard', { timeout: 10000 });
  32 |   }
  33 | 
  34 |   async assertPageTitle() {
  35 |     await expect(this.page).toHaveTitle(/OurPGTracker|Login/);
  36 |   }
  37 | 
  38 |   async assertLoginFormVisible() {
  39 |     await expect(this.page.locator(loginSelectors.identifierInput)).toBeVisible();
  40 |     await expect(this.page.locator(loginSelectors.passwordInput)).toBeVisible();
  41 |     await expect(this.page.locator(loginSelectors.signInButton)).toBeVisible();
  42 |   }
  43 | 
  44 |   async assertErrorMessage(message: string) {
  45 |     const errorElement = this.page.locator(loginSelectors.errorMessage);
  46 |     await expect(errorElement).toBeVisible();
  47 |     await expect(errorElement).toContainText(message);
  48 |   }
  49 | 
  50 |   async togglePasswordVisibility() {
  51 |     await this.page.click('button[aria-label*="password"]');
  52 |   }
  53 | 
  54 |   async isPasswordVisible() {
  55 |     const passwordInput = this.page.locator(loginSelectors.passwordInput);
  56 |     const inputType = await passwordInput.getAttribute('type');
  57 |     return inputType === 'text';
  58 |   }
  59 | 
  60 |   async clickForgotPassword() {
  61 |     await this.page.click(loginSelectors.forgotPasswordLink);
  62 |   }
  63 | }
  64 | 
```