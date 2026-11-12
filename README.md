# CWP storymap template

A template for Center for Western Priorities scrolling map stories: a photo header and introduction, then a list of places that readers scroll through while a map beside the text flies to each one. The [BAAJA public lands map](https://github.com/Center-for-Western-Priorities/2026-BAAJA-Public-Lands-Map) is the model.

Each project keeps its content in three plain files:

| File | What it holds | Who usually edits it |
| --- | --- | --- |
| `content/story.md` | Every word readers see: title, subtitle, notice banner, introduction, one section per place, and notes | Writers and editors, through Google Docs |
| `content/sites.csv` | One row per map point: coordinates, filter categories, and photo credits | Whoever builds the map, through Google Sheets |
| `config.yml` | Settings: map area, colors, filters, partner logo, header photo | Whoever builds the map |

When any of these files changes on GitHub, the site rebuilds and republishes itself within a few minutes. The build checks for common mistakes first. If it finds one, the live map stays as it was and GitHub emails the person who made the change.

A plain-language guide for colleagues who don't use GitHub lives in Google Docs: **[Storymap template: how to edit and publish](https://docs.google.com/document/d/1YjJvV-bLdko6gpQwPysDrM0zu2UNbTnXUBn4-Xb6tgE/edit)**. Starter copies of `story.md` and the places sheet are in the same [Drive folder](https://drive.google.com/drive/folders/1DWupwR3jyJEgY_O-3ANdNsRk9Jr1iwGW).

---

## Start a new map

Step-by-step instructions for anyone on the team, including settings and troubleshooting, are in **[Storymap template: start a new map](https://docs.google.com/document/d/1QIgTtDmayVgHx13AoiWYDDkZxu_GWHXvBJaLGaNxsZQ/edit)**. The short version:

1. On this repo's GitHub page, click **Use this template** > **Create a new repository**. Choose the `Center-for-Western-Priorities` organization, name the repo (for example, `2027-Monuments-Map`), set it to **Public**, and click **Create repository**.
2. In the new repo, go to **Settings** > **Pages**. Under **Build and deployment** > **Source**, choose **GitHub Actions**.
3. Go to the **Actions** tab. If a run named "Build and publish map" failed because Pages wasn't turned on yet, open it and click **Re-run all jobs**.
4. When the run finishes, the map is live at `https://center-for-western-priorities.github.io/REPO-NAME/`. Put that address in `config.yml` as `site_url` so social media previews work.
5. Replace the sample content in `content/story.md`, `content/sites.csv`, `config.yml`, and `images/`.
6. Choose the link preview picture under `share` in `config.yml` (see below).

---

## Writing the text: `content/story.md`

The file follows a fixed outline. Headings can be real headings (Heading 1 or Heading 2 in Google Docs, or `#` and `##` in Markdown) or a line that is entirely bold, which is how many CWP drafts are written. Numbers at the start of a heading, like "4. Boundary Waters, Minnesota", are ignored.

```markdown
# Map title

The subtitle: one or two sentences right under the title.

## Notice
Optional banner at the top of the page, for update notes. Delete the section to hide it.

## Introduction
Paragraphs that appear before the map.

## Chaco Canyon
Text for this place. Paragraphs, links, bold, italics, bulleted lists, and ### subheadings all work.

## Bears Ears National Monument
Text for the next place.

## Notes
Optional section below the map, for methodology or sources.
```

Rules the build enforces:

- **The title comes first.** It needs to be a Title or Heading 1 line (`# ` in Markdown).
- **Each place heading must match a `name` in `sites.csv`.** The match ignores capital letters, leading numbers, and anything after a comma, so "1. Chaco Canyon, New Mexico" matches the name "Chaco Canyon".
- **Places appear on the map in the order they appear in the doc.** Numbers on the map follow that order.
- **Reserved headings:** Notice (also "Update"), Introduction (also "Intro" or "Intro text"), and Notes (also "Methodology", "Sources", or "About this map").
- **Keep other material out of the file.** Blog drafts, press statements, and editing notes belong in a separate doc. A heading that doesn't match a place or a reserved name stops the build, so stray text can't land under the wrong place.
- **Photos pasted into the doc are removed.** Add photos through `images/` and `sites.csv` instead.

### Moving edits from Google Docs to GitHub

Google Docs can open and edit `.md` files directly, and it can copy and download any doc as Markdown ([Google's instructions](https://support.google.com/docs/answer/12014036)). Pick whichever fits:

- **Edit `story.md` in Google Drive.** Keep a file named `story.md` in the project's Drive folder and edit it in Google Docs. To publish, download it from Drive, then in GitHub open the `content` folder, click **Add file** > **Upload files**, drag in `story.md`, and click **Commit changes**. The upload replaces the old version.
- **Copy and paste.** In a regular Google Doc, turn on **Tools** > **Preferences** > **Enable Markdown**. Select all, right-click, and choose **Copy as Markdown**. In GitHub, open `content/story.md`, click the pencil icon, select everything, paste, and click **Commit changes**.
- **Download from a regular Google Doc.** Use **File** > **Download** > **Markdown (.md)**, rename the downloaded file to `story.md`, and upload it as above.

---

## Listing the places: `content/sites.csv`

Edit this in Google Sheets, then use **File** > **Download** > **Comma separated values (.csv)**, rename the file `sites.csv`, and upload it to the `content` folder. Columns can be in any order.

| Column | Required | What goes in it |
| --- | --- | --- |
| `id` | Yes | Short web-safe label: lowercase letters, numbers, and hyphens, like `bears-ears`. Used in links that jump to a place (`…/#bears-ears`). Don't change it after launch, or old links will break. |
| `name` | Yes | The place name shown on the map. Must match its heading in `story.md`. |
| `lat`, `lon` | Yes | Decimal coordinates, like `36.0285` and `-107.9101`. Longitudes in the U.S. are negative. Right-click a spot in Google Maps to copy its coordinates. |
| `photo` | No | File name of a photo in the `images` folder, like `chaco.jpg`. Capital letters must match. |
| `photo_caption` | No | What the photo shows. Also used as the photo's alt text unless you add a `photo_alt` column. |
| `photo_credit`, `photo_credit_url` | No | Who took the photo, and a link to the source page. |
| `photo_license`, `photo_license_url` | No | For Creative Commons photos, the license name (like `CC BY 2.0`) and its link. Leave blank for public domain and permissioned photos. |
| Any other column | No | Categories used for filters, colors, and tags, like `state`, `threat`, or `agency`. |

For a place with more than one value in a category, separate them with semicolons: `Mining; Oil and gas`. When a column sets point colors, the first value decides the color.

A row with no matching section in `story.md` is left off the map, and the build lists it as a warning. That's useful for staging places before their text is approved.

**Photos:** Add them to the `images` folder (on GitHub, open the folder, then **Add file** > **Upload files**). Landscape photos about 1,600 pixels wide and under 300 KB load quickly. Photos display in a 3:2 frame.

---

## Settings: `config.yml`

Every setting has a note above it in the file. The main ones:

**Map area (`map.extent`)**

- `us`: All 50 states, with Alaska and Hawaii in insets. This is the default.
- `states`: One or more states, for example `states: [Colorado, Utah]`. Neighboring states show as context.
- `box`: A rectangle, for example `box: [-112.5, 34.5, -105.5, 39.5]` (west, south, east, north).
- `custom`: Your own shapes. Put a GeoJSON file in the repo (counties, a watershed, a country) and set `basemap` to its path. Each shape should have a `name` property. [mapshaper.org](https://mapshaper.org) can convert shapefiles to GeoJSON and simplify them so the page loads quickly.

`point_zoom` controls how close the map zooms on each place (smaller zooms in closer). `numbered: false` drops the numbers from the points.

**Colors (`points`)**

Name the `sites.csv` column that sets point colors in `color_by`, and list a color for each value. Colors are six-digit codes; CWP's palette is in the `cwp-design-branding` skill. A value in the CSV with no color stops the build, which catches typos like "Minning". Leave `color_by` blank to make every point one color.

**Filters**

Each filter is built from a `sites.csv` column. `dropdown` lets readers pick one value; `buttons` lets them toggle several. Use any column, or write `filters: []` for none.

**Tags**

`tags` lists the columns shown as small labels under each place's name. Values from the color column get a colored dot.

**Partner logo and header photo**

For a co-branded map, put the partner's logo in `assets/` (SVG looks sharpest) and fill in `partner`. Leave `partner.logo` blank for a CWP-only page. Leave `hero.image` blank for a header without a photo.

---

## Publishing and fixing errors

Every change saved to the `main` branch triggers the **Build and publish map** workflow. To see what happened, open the **Actions** tab and click the latest run.

- **Green check:** The map is live with the changes. Allow a minute for the site to refresh.
- **Red X:** Nothing was published. The run's summary page lists each problem in plain language, such as which row has a bad coordinate or which heading doesn't match a place. Fix the file, upload it again, and the build reruns. Warnings (yellow) don't stop publishing but are worth reading.

To rebuild without changing anything, open **Actions** > **Build and publish map** > **Run workflow**.

## Link previews

When someone shares the map's address on Facebook, LinkedIn, Bluesky, X, or Slack, the post shows a preview card with the story title, subtitle, and a picture. The `share` setting in `config.yml` picks the picture:

- `map` (default): every publish makes `social-card.jpg`, a 1,200 by 630 pixel picture of the full map with the CWP logo, and the partner logo if there is one, small in the bottom right corner.
- `hero`: the large photo at the top of the page.
- A path to your own picture, like `images/share.jpg`. Make it 1,200 by 630 pixels so platforms don't crop it.

Previews only work once `site_url` is filled in. The map picture is made with Chrome, which GitHub's build machines already have. If Chrome isn't available, the build warns and falls back to the top photo.

Platforms cache previews. After changing the picture on a link that has already been shared, refresh it in Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) and LinkedIn's [Post Inspector](https://www.linkedin.com/post-inspector/).

## Embedding on westernpriorities.org

Use a full-width page template with one iframe sized to the screen:

```html
<iframe src="https://center-for-western-priorities.github.io/REPO-NAME/" title="Map title" style="width:100%;height:100vh;border:0;display:block"></iframe>
```

Add `#id` to the address to open the map at a specific place, for example `…/REPO-NAME/#chaco`.

## Previewing on your own computer (optional)

With [Node.js](https://nodejs.org) installed, run `npm install` once, then `npm run preview` and open the address it prints. `npm run build` alone runs the checks and writes the page to `_site/`.

## Changing the design

The page layout lives in `src/`: `template.html` (page structure), `styles.css` (CWP colors and fonts), and `app.js` (map and scrolling behavior). `src/build.mjs` reads the content, checks it, and assembles the page. Changes here affect every map made from the template afterward; existing maps keep the version they were created with.
