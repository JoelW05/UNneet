/**
 * Employer names to probe for a public Greenhouse / Lever / Ashby board. This is a SEARCH LIST,
 * not a claim: `pnpm --filter @unneet/ingest ats:discover` tries each name against the three ATS
 * APIs and keeps only boards that exist AND currently have UK jobs. Add names freely.
 *
 * Format: "Display name" or "Display name|slug1,slug2" when the board token isn't the obvious one.
 */
export const CANDIDATES: readonly string[] = `
Monzo
Wise|wise,transferwise
Revolut
Starling Bank|starlingbank
Checkout.com|checkoutcom,checkout
GoCardless
Zopa
OakNorth|oaknorth
ClearScore|clearscore
Curve
Moneybox
Plum
Cleo
Tide
Yapily
TrueLayer
Paysend
Thought Machine|thoughtmachine
10x Banking|10xbanking,10x
Marshmallow
Lendable
Zilch
Klarna
PensionBee
Freetrade
Chip
Atom Bank|atombank
Allica Bank|allicabank
Kroo
Wayhome
Habito
Nested
Octopus Energy|octopusenergy,octopus
Octopus Group|octopusgroup
OVO Energy|ovoenergy,ovo
Bulb
Zapmap
Pod Point|podpoint
Kraken Technologies|kraken,krakentechnologies
Deliveroo
Just Eat Takeaway|justeattakeaway,justeat
Gousto
Hello Fresh|hellofresh
Cazoo
Auto Trader|autotrader
Rightmove
Zoopla
Onthemarket
Skyscanner
Trainline
Ocado Technology|ocado,ocadotechnology
Farfetch
ASOS|asos
Depop
Vinted
Gymshark
Peloton
Bumble
Badoo
Monese
Babylon
Ada Health|adahealth
Huma
Kheiron Medical|kheiron
Benevolent AI|benevolentai
Exscientia
Oxford Nanopore|oxfordnanopore
Immunocore
Isomorphic Labs|isomorphiclabs
DeepMind|deepmind,googledeepmind
Faculty
Improbable
Graphcore
Arm|arm
Wayve
Cleo AI|cleoai
Synthesia
ElevenLabs|elevenlabs
Stability AI|stabilityai
Hugging Face|huggingface
Mistral AI|mistral
Cohere
Anthropic
OpenAI|openai
Ramp
Linear
Notion
Figma
Canva
Airtable
Asana
Atlassian
Slack
Stripe
Plaid
Datadog
Cloudflare
Elastic
HashiCorp|hashicorp
GitLab|gitlab
GitHub
Mozilla
Dropbox
Box
Twilio
Okta
MongoDB|mongodb
Snowflake
Databricks
Confluent
Fastly
Sumo Logic|sumologic
PagerDuty|pagerduty
Sentry
Postman
Grafana Labs|grafanalabs
Snyk
Darktrace
Sophos
Mimecast
Tessian
Cyberhaven
Onfido
Yoti
Ravelin
Featurespace
ComplyAdvantage|complyadvantage
Quantexa
Dataiku
Palantir
Cleo Health|cleohealth
Bupa
Livi
Doctorlink
Push Doctor|pushdoctor
Kry
Accurx
Cera
Oviva
Zava
Lifted
Thriva
Zoe|joinzoe,zoe
Eve Sleep|evesleep
Made.com|madecom
Wayfair
Dunelm
Currys
Boots
Sainsbury's|sainsburys
Tesco
Asda
Morrisons
Co-op|coop,coopuk
John Lewis|johnlewis
Marks and Spencer|marksandspencer,mands
Next
Primark
Burberry
Superdry
Sports Direct|sportsdirect
JD Sports|jdsports
Pret A Manger|pret
Greggs
Wagamama
Nandos
Itsu
Leon
Pizza Express|pizzaexpress
Deliveroo Editions|deliveroo-editions
Wetherspoon
Premier Inn|premierinn
Whitbread
Hilton
Marriott
IHG
Virgin Atlantic|virginatlantic
Virgin Media O2|virginmediao2,virginmedia
Virgin Money|virginmoney
Virgin Active|virginactive
British Airways|britishairways
EasyJet|easyjet
Jet2
TUI
Network Rail|networkrail
Transport for London|tfl
Arriva
FirstGroup|firstgroup
Stagecoach
Go-Ahead|goahead
Royal Mail|royalmail
Evri
DPD
Amazon
Google
Microsoft
Apple
Meta
Salesforce
Oracle
SAP
IBM
Cisco
Intel
Nvidia
Qualcomm
Adobe
Autodesk
Intuit
PayPal
Visa
Mastercard
American Express|americanexpress
Barclays
HSBC
Lloyds Banking Group|lloydsbankinggroup,lloyds
NatWest|natwest
Santander
Nationwide
Aviva
Legal and General|legalandgeneral
Prudential
Standard Life|standardlife
Phoenix Group|phoenixgroup
Hargreaves Lansdown|hargreaveslansdown
AJ Bell|ajbell
Schroders
M&G|mandg
Aberdeen
Jupiter
Man Group|mangroup
Marshall Wace|marshallwace
Citadel
Jane Street|janestreet
Optiver
IMC Trading|imc
Hudson River Trading|hudsonrivertrading
Two Sigma|twosigma
Millennium
Point72
Balyasny
G-Research|gresearch
Flow Traders|flowtraders
DRW
XTX Markets|xtxmarkets
Deloitte
PwC
EY
KPMG
BDO
Grant Thornton|grantthornton
Mazars
Accenture
Capgemini
Cognizant
Infosys
Wipro
Thoughtworks|thoughtworks
Made Tech|madetech
Public Digital|publicdigital
Hippo Digital|hippodigital
Kainos
Softwire
Scott Logic|scottlogic
Equal Experts|equalexperts
Codurance
Cleverbit
Mastodon C|mastodonc
Ministry of Justice Digital|moj
GDS
NHS Digital|nhsdigital
BBC
ITV
Channel 4|channel4
Sky
Guardian|theguardian
Financial Times|ft
Reach plc|reachplc
News UK|newsuk
Daily Mail|dailymail
Pearson
Penguin Random House|penguinrandomhouse
Hachette
HarperCollins|harpercollins
Bloomsbury
Spotify
Deezer
Shazam
Mixcloud
Soundcloud
Moonpig
Gumtree
Cazoo Group|cazoogroup
BrewDog|brewdog
Innocent Drinks|innocent
Oatly
Pact Coffee|pactcoffee
Huel
Graze
Tails.com|tailscom
Bark
Pawsy
Vet Partners|vetpartners
CVS Group|cvsgroup
Pets at Home|petsathome
Barnardos|barnardos
Shelter
Oxfam
Save the Children|savethechildren
British Red Cross|redcross
Macmillan
Cancer Research UK|cancerresearchuk
Teach First|teachfirst
Ark|arkonline
Ambition Institute|ambitioninstitute
Now Teach|nowteach
Brilliant Club|thebrilliantclub
Prince's Trust|princestrust
Impetus
Social Mobility Foundation|socialmobilityfoundation
Sutton Trust|suttontrust
Code First Girls|codefirstgirls
Founders and Coders|foundersandcoders
Makers
Le Wagon|lewagon
General Assembly|generalassembly
Multiverse
Pearson College|pearsoncollege
FutureLearn
Coursera
Udemy
Duolingo
Babbel
Kahoot
Century Tech|centurytech
Sparx
Oak National Academy|oaknationalacademy
Bright Network|brightnetwork
Handshake
Prospects
Milkround
Rare Recruitment|rarerecruitment
Brightside
Unloc
Upreach
Yes Futures|yesfutures
Rolls-Royce|rollsroyce
BAE Systems|baesystems
Airbus
Leonardo
Thales
QinetiQ
MBDA
Babcock
Lockheed Martin|lockheedmartin
Dyson
JCB
McLaren
Aston Martin|astonmartin
Jaguar Land Rover|jaguarlandrover
Nissan
Toyota
Siemens
Bosch
Unilever
GSK
AstraZeneca
Novartis
Pfizer
Roche
Sanofi
Reckitt
Diageo
Mars
Nestle
Mondelez
PepsiCo
Coca-Cola|cocacola
Centrica
British Gas|britishgas
SSE
National Grid|nationalgrid
Octopus Renewables|octopusrenewables
Ørsted|orsted
Vattenfall
EDF
E.ON|eon
ScottishPower|scottishpower
Thames Water|thameswater
Severn Trent|severntrent
United Utilities|unitedutilities
Anglian Water|anglianwater
BT
Vodafone
EE
Three
TalkTalk|talktalk
Openreach
CityFibre|cityfibre
Hyperoptic
Gigaclear
Zen Internet|zeninternet
Bloom Energy|bloom
Arrival
Zapp
Lime
Bolt
Uber
Cazoo Tech|cazootech
Tier
Voi
Beryl
Heetch
Cuvva
Zego
Wunelli
Marshmallow Insurance|marshmallowinsurance
Cuvva Insurance|cuvvainsurance
Lemonade
Hiscox
Admiral
Direct Line|directline
LV=|lv
Zurich
AXA
Allianz
Aon
Marsh McLennan|marshmcclennan
Willis Towers Watson|willistowerswatson
Lloyd's|lloyds
Beazley
Hiscox Group|hiscoxgroup
Ki Insurance|ki
Flock
Cytora
Cuvva Ltd|cuvvaltd
Cazana
Wejo
Paddle
Mollie
Adyen
Worldpay
Global Payments|globalpayments
Nuvei
SumUp|sumup
Zettle
Square
Shopify
BigCommerce
Contentful
Storyblok
Sanity
Prismic
Algolia
Bynder
Brandwatch
Meltwater
Sprinklr
HubSpot|hubspot
Intercom
Zendesk
Freshworks
Gorgias
Typeform
Miro
Mural
Lucid
Loom
Calendly
Doodle
Trello
Monday.com|mondaycom
ClickUp
Smartsheet
Workday
Personio
Deel
Remote
Oyster
Rippling
Gusto
Lattice
Culture Amp|cultureamp
Peakon
Glint
Cezanne HR|cezannehr
BrightHR|brighthr
Employment Hero|employmenthero
Hibob
Beamery
Eightfold
SmartRecruiters
Greenhouse
Lever
Ashby
Workable
Hireology
Reed
Adzuna
Indeed
Glassdoor
Totaljobs
CV-Library|cvlibrary
Jobsite
Monster
Hays
Michael Page|michaelpage
Robert Walters|robertwalters
Randstad
Adecco
ManpowerGroup|manpowergroup
Kelly
Gi Group|gigroup
Reed Specialist|reedspecialist
Pleo
Tractable
Peak AI|peakai,peak
Satalia
Hotjar
Bidnamic
Elvie
Perkbox
Pollen
Bitpanda
Wefox
Zepz|zepz,worldremit
Ebury
Tandem Bank|tandembank,tandem
OpenPayd|openpayd
Banked
Modulr
Railsr|railsr,rails
Currencycloud|currencycloud
Soldo
Thredd
Crowdcube
Seedrs
Yoyo Wallet|yoyowallet
Mindful Chef|mindfulchef
Cook
Pip and Nut|pipandnut
Getir
Gorillas
Sumo Digital|sumodigital,sumo
Team17|team17
Rebellion
Frontier Developments|frontier,frontierdevelopments
Jagex
Rocksteady
Playtonic
Splash Damage|splashdamage
Media Molecule|mediamolecule
Creative Assembly|creativeassembly
Supermassive Games|supermassive,supermassivegames
Hutch
Space Ape|spaceape
Playstack
Ustwo|ustwo
Netcompany
Healx
Ieso
Sensyne
Congenica
Bicycle Therapeutics|bicycletherapeutics
Autolus
Adaptimmune
Mogrify
LabGenius|labgenius
Zenobe
Pivot Power|pivotpower
Field Energy|fieldenergy
Ohme
Connected Kerb|connectedkerb
Ember
Kensa
Shell
BP
Citizens Advice|citizensadvice
British Heart Foundation|bhf
Mind
NSPCC
Scope
Age UK|ageuk
Marie Curie|mariecurie
Comic Relief|comicrelief
Action for Children|actionforchildren
The Children's Society|childrenssociety
YMCA|ymca
Crisis
Centrepoint
Samaritans
Citizens UK|citizensuk
Teach First Careers|teachfirstcareers
Unlocked Graduates|unlockedgraduates
Frontline
Police Now|policenow
Civil Service|civilservice
Government Digital Service|gds
Cabinet Office|cabinetoffice
Home Office|homeoffice
HMRC
DWP Digital|dwpdigital
Ministry of Defence|mod
NHS England|nhsengland
Ofcom
Ofsted
Bank of England|bankofengland
Financial Conduct Authority|fca
Lloyds Register|lloydsregister
Ordnance Survey|ordnancesurvey
Met Office|metoffice
British Library|britishlibrary
British Museum|britishmuseum
Tate
V&A|vanda
Science Museum Group|sciencemuseumgroup
Royal Opera House|royaloperahouse
National Theatre|nationaltheatre
National Trust|nationaltrust
English Heritage|englishheritage
Historic England|historicengland
Forestry England|forestryengland
Canal and River Trust|canalandrivertrust
RSPB
WWF
Greenpeace
Friends of the Earth|friendsoftheearth
Amnesty
Human Rights Watch|humanrightswatch
Which
Money Saving Expert|moneysavingexpert
Money Helper|moneyhelper
StepChange|stepchange
Starling
Monese Ltd|moneseltd
Bud
Fintern
Kinly
Cuvva Group|cuvvagroup
Hiyacar
Zipcar
Co-wheels|cowheels
Gett
Addison Lee|addisonlee
Ocado Group|ocadogroup
Wayfair UK|wayfairuk
Argos
Sainsburys Tech|sainsburystech
Tesco Technology|tescotechnology
M and S Digital|mandsdigital
John Lewis Partnership|johnlewispartnership
Waitrose
Aldi
Lidl
Iceland
B&M|bandm
Poundland
Wilko
Halfords
Screwfix
B&Q|bandq
Kingfisher
Dunelm Group|dunelmgroup
Ikea
Habitat
Heal's|heals
Oliver Bonas|oliverbonas
Fat Face|fatface
White Stuff|whitestuff
Joules
Ted Baker|tedbaker
Reiss
Whistles
AllSaints|allsaints
Charles Tyrwhitt|charlestyrwhitt
Jack Wills|jackwills
Hollister
ASOS Tech|asostech
Missguided
Pretty Little Thing|prettylittlething
Boohoo
Shein
Vestiaire Collective|vestiairecollective
Net-a-Porter|netaporter
Matches Fashion|matchesfashion
Mr Porter|mrporter
Selfridges
Harrods
Liberty
Fenwick
Fortnum and Mason|fortnumandmason
Hamleys
Build-A-Bear|buildabear
Lego
Games Workshop|gamesworkshop
Warner Bros Discovery|warnerbrosdiscovery
Disney
Netflix
Amazon Prime Video|primevideo
Apple TV|appletv
Paramount
Sky Sports|skysports
BT Sport|btsport
Eurosport
DAZN
Premier League|premierleague
Football Association|fa
Wimbledon
Silverstone
Formula 1|formula1
McLaren Racing|mclarenracing
Williams Racing|williamsracing
Red Bull Racing|redbullracing
Mercedes AMG|mercedesamg
Aston Martin Racing|astonmartinracing
Alpine
Haas
Sauber
Visa Cash App Racing|visacashapp
Ricardo
Arup
Atkins
Mott MacDonald|mottmacdonald
WSP
AECOM
Jacobs
Balfour Beatty|balfourbeatty
Kier
Laing O'Rourke|laingorourke
Skanska
Willmott Dixon|willmottdixon
Mace
Lendlease
Berkeley Group|berkeleygroup
Barratt
Persimmon
Taylor Wimpey|taylorwimpey
Redrow
Bellway
Crest Nicholson|crestnicholson
Countryside
Savills
Knight Frank|knightfrank
JLL
CBRE
Cushman and Wakefield|cushmanandwakefield
Colliers
Landsec
British Land|britishland
Segro
Grosvenor
Crown Estate|crownestate
Sellar
Canary Wharf Group|canarywharf
Hammerson
Intu
Westfield
Network Homes|networkhomes
Peabody
Clarion
Sanctuary
Places for People|placesforpeople
Home Group|homegroup
Orbit
Riverside
Notting Hill Genesis|nottinghillgenesis
L&Q|landq
Hyde
Southern Housing|southernhousing
Optivo
Metropolitan Thames Valley|mtvh
Guinness Partnership|guinness
Anchor
Hightown
Stonewater
Sovereign
Aster
Yorkshire Housing|yorkshirehousing
Leeds Building Society|leedsbuildingsociety
Yorkshire Building Society|ybs
Coventry Building Society|coventrybuildingsociety
Skipton|skipton
Principality|principality
Newcastle Building Society|newcastlebuildingsociety
Nottingham Building Society|nottinghambuildingsociety
Monmouthshire Building Society|monmouthshire
Metro Bank|metrobank
Shawbrook|shawbrook
Aldermore|aldermore
Paragon|paragon
Close Brothers|closebrothers
Investec
Rathbones
Brewin Dolphin|brewindolphin
Quilter
St James's Place|sjp
Charles Stanley|charlesstanley
Evelyn Partners|evelynpartners
Tilney
Bestinvest|bestinvest
Fidelity International|fidelityinternational
Vanguard
BlackRock|blackrock
State Street|statestreet
JP Morgan|jpmorgan
Goldman Sachs|goldmansachs
Morgan Stanley|morganstanley
Citi
Deutsche Bank|deutschebank
UBS
Credit Suisse|creditsuisse
BNP Paribas|bnpparibas
Societe Generale|societegenerale
Nomura
Macquarie
Lazard
Rothschild
Evercore
Houlihan Lokey|houlihanlokey
PJT
Jefferies
Cantor Fitzgerald|cantorfitzgerald
Tradeweb
Bloomberg
Refinitiv
LSEG
ICE
CME
Euronext
Cboe
MarketAxess|marketaxess
Virtu
Citadel Securities|citadelsecurities
Tower Research|towerresearch
Squarepoint|squarepoint
Qube
Winton
Aspect Capital|aspectcapital
Brevan Howard|brevanhoward
BlueCrest|bluecrest
Capula
Egerton
Odey
Lansdowne
Pictet
Tikehau
Permira
CVC
Apax
EQT
Cinven
Bridgepoint
Hg
Hellman and Friedman|hellmanandfriedman
KKR
Blackstone
Carlyle
TPG
Warburg Pincus|warburgpincus
General Atlantic|generalatlantic
Index Ventures|indexventures
Balderton
Atomico
Accel
Sequoia
Benchmark
Lightspeed
Northzone
Seedcamp
Entrepreneur First|entrepreneurfirst
Techstars
Y Combinator|ycombinator
`
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//'));

/** "Display name|slug1,slug2" → { name, slugs }. Default slugs are derived from the name. */
export function parseCandidate(line: string): { name: string; slugs: string[] } {
  const [name = '', explicit] = line.split('|');
  const base = name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim();
  const derived = [
    base.replace(/\s+/g, ''),
    base.replace(/\s+/g, '-'),
    (base.split(' ')[0] ?? '').trim(),
  ];
  const slugs = [...(explicit ? explicit.split(',') : []), ...derived]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return { name: name.trim(), slugs: [...new Set(slugs)] };
}
