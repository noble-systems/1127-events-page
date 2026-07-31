# A2P 10DLC registration

Texts cannot send until this is done. Two people are already recorded as
opted in, so the clock matters: a long gap between consent and first message
reads badly to carriers.

Everything here is paste-ready. The console does the registering; this file
exists so you never have to compose an answer on the spot.

## Where

AWS Console → **End User Messaging** (was Pinpoint SMS) → region **us-west-1**.

## 1. Brand registration

| Field | Paste |
|---|---|
| Legal company name | 1127 Events LLC *(use the exact registered name)* |
| Company type | Private |
| EIN | *(yours)* |
| Vertical | Entertainment |
| Website | https://1127.events |
| Address | 6850 E McDowell Rd #4400, Scottsdale, AZ 85257 |

## 2. Campaign registration

| Field | Paste |
|---|---|
| Use case | Low Volume Mixed *(cheapest; fits announcements)* |
| Campaign description | 1127 Events sends event announcements to people who opted in by entering their phone number on our RSVP and application forms at https://1127.events. Messages announce new and upcoming event dates. |
| Message flow / opt-in description | Users opt in by typing their phone number into a form at https://1127.events/rsvp. The form states: "Adding your number opts you in to text messages from 1127 Events about new and upcoming dates. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for help." A number is never required to submit. |
| Sample message 1 | 1127 Events: Mirage at Solaya is announced. Date and RSVP: https://1127.events/rsvp Reply STOP to opt out. |
| Sample message 2 | 1127 Events: You're on the list. Reply STOP any time to opt out, HELP for help. |
| Opt-in keywords | *(none; web form opt-in)* |
| Opt-out handling | Managed by AWS opt-out list (STOP/UNSUBSCRIBE handled automatically) |

## 3. Phone number

Request a **10DLC number** in the same console, associate it with the
campaign, and create an **opt-out list** named `1127-events-optout`.

## 4. Wire it up (tell Claude when you're here)

Amplify env vars, then redeploy:

```
SMS_ORIGINATION_IDENTITY=<the phone number arn or number>
SMS_OPT_OUT_LIST=1127-events-optout
```

The app already sends the compliant opt-in confirmation the moment these are
set; nothing else changes. Registration review typically takes a few days.
