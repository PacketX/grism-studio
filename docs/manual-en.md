# GRISM Studio Operations Manual

GRISM Studio is the web interface for the GRISM packet broker. Point a browser at the device — nothing to install.

The address is the device's management IP plus `/grism-studio/`, for example `https://192.168.1.100/grism-studio/`.

---

## 1. Getting started

### 1.1 Signing in

Account menu (top right) → **login**, then the device's username and password.

**You can look around without signing in**: Studio loads a template so you can learn the interface and try editing. These actions need a session:

- Loading the device's running configuration
- Submitting a configuration
- Traffic statistics, system status, system log
- Packet capture

The session survives a page refresh.

**Read-only accounts**: an account with read-only privilege (`guest`, for instance) gets a banner across the top and a **read-only** badge beside its name, and every button that would change the device is greyed out. Such an account can read everything and edit its own local draft, but cannot submit. The one exception is **changing its own password**, which stays available — and the settings page shows that single card and nothing else.

### 1.2 Layout

The top navigation holds four workspaces; click one to expand its tabs.

| Workspace | What it is for |
|---|---|
| **Overview** | Explains in prose what the open configuration does |
| **Pipeline** | Where the configuration is edited |
| **Traffic** | Live interface, session, service and country figures |
| **System** | Device status, log, and all device settings |

### 1.3 The toolbar

**load running** — fetches the device's running configuration and opens it. If you have unsubmitted edits, it asks first.

Beside the button is the **sync indicator**:

- **in sync** — what is open matches the device exactly
- **unapplied changes** — something has been edited but not submitted

**Problems and warnings** — reads **valid**, or *N issues / N warnings*. Click for the list; every entry has a **jump** that takes you to the place at fault. A configuration with issues cannot be submitted.

**Undo / redo (↶ ↷)** — pipeline workspace only. Filters, inputs, outputs, actions and chains each keep their own history.

**Account menu** — sign in/out, language (English / 繁體中文), appearance (light / dark).

### 1.4 Where the configuration came from

The toolbar says which of three:

- **the device's running configuration** — the usual starting point
- **the "XXX" template** — a built-in example, not tailored to this device
- **a configuration entered by hand** — pasted or edited on the Export page

> ⚠️ Submitting a **template** raises a louder confirmation: its ports and parameters were not written for this device.

---

## 2. Overview

Once a configuration is open, this page says what it does in plain language: how many filters and chains, which ports are involved, and what it is probably for.

Chains and filters are then listed one by one. **Hovering a filter or an output shows its conditions and actions** — you can read a chain without leaving the page.

Where several filters make up one condition, it says *(matches all)* or *(matches any)*. A filter with `blockifempty` set has its wording inverted automatically.

---

## 3. Pipeline

The main workspace. Three ideas first:

```
Filters (what to match)  →  Chains (where it goes)  →  Outputs (which port, rewritten how)
```

- A **filter** describes a kind of packet and can be reused
- A **chain** strings ingress ports, filters and outputs into one decision path
- An **output** says which port to send to, and whether to rewrite, encapsulate or duplicate

### 3.1 Chains

The canvas draws one chain. The chain list is on the left (drag to reorder), the inspector on the right.

**Node types**:

| Node | Meaning |
|---|---|
| **Ingress** | Which ports traffic arrives on |
| **FILTER** | A decision point, splitting into *match* and *not match* |
| **Output** | Which ports to send to |
| **Discard** | Not forwarded |

**Working with it**:

- Click a node → edit it in the inspector
- **Hovering a node shows a tip**: ingress and output show port names with their descriptions, plus any advanced VLAN operation (add or strip a tag); a filter node shows the conditions it actually tests
- The inspector can insert a decision above an existing node (*+ filter (this → match)*)
- `Ctrl` + mouse wheel zooms the canvas

**Output mode**: with several ports, choose **duplicate** (a copy to every port) or **load balance** (split on a chosen field).

### 3.2 Filters

Pick a filter on the left, edit its conditions on the right.

Conditions form a tree: `and` (matches all), `or` (matches any), `not` (inverted). Each condition takes a field, a relation and a value — `vlan.id` == `921`, say.

Fields span L2 to L7 (MAC, VLAN, IP, ports, TCP flags, TLS/JA4, DNS, GTP, HTTP and more). **The field list comes from the firmware.** A name the firmware does not implement is dropped silently, so choose from the list rather than typing a name that is not in it.

Deleting a filter selects the **next** one, not the first. Inputs, outputs, actions and chains behave the same way.

### 3.3 Advanced: inputs, outputs, actions

These three tabs sit under the **Advanced** group; click it to reveal them.

**Inputs** — traffic sources that are not physical ports: replaying a pcap file (`replayPcap`), a traffic generator.

> ⚠️ `replayPcap` **transmits out of** the named port; it does not inject as ingress. For the packets to re-enter the pipeline, use a LOOP-type port.

**Outputs** — named outputs (`O1`, `O2`…) that can:

- Rewrite the packet (MAC / IP / ports / TCP MSS)
- Add or strip VLAN tags (Q / QinQ)
- Encapsulate (VXLAN / NVGRE / GRE / UDP)
- Generate a reply, mirror, redirect
- Cap or floor the rate, cap the packet length
- Write to a storage volume as pcap

**Actions** — per-ingress handling: ARP / ICMP replies, ingress VLAN operations, heartbeat detection.

### 3.4 Simulate

See the path a packet takes before touching the device.

1. Choose an **ingress port**
2. Set each filter to *match* or *not match* (there are all-match and all-not-match shortcuts)
3. Press **▶ play** — packets are sent continuously and animated along their real path

**Inline devices**: add a virtual inline device (an IPS, say) between two ports. A packet leaving port A returns on port B, and if B has a chain of its own it carries on through it — which is how you verify a full inline path.

Filters and outputs here also **show their detail on hover**.

### 3.5 Export and submit

This page holds the complete configuration XML, and is where it is submitted.

**Changes (diff)** — whenever the configuration differs from what was loaded, the full file's diff is shown with added and removed lines coloured. Clicking the change count **jumps block by block** to the next difference (click `+` for additions, `−` for removals).

**submit to device** — overwrites the running configuration and applies it immediately. Not available while issues are unresolved.

**Automatic snapshot before every submit** — Studio saves the current version onto the device first, keeping the newest **5**. Any of them can be listed, loaded back, or deleted here. They are stored apart from *Saved configurations* below, so the two never mix.

**Saved configurations** — the card on the right, holding versions you named and saved yourself. Click to expand, then load, retitle or delete.

**Edit / format / copy** — the XML can be edited as text and then applied, or copied whole.

> 💡 Unsubmitted edits live **only in the browser**. Closing the tab or refreshing loses them. Submit, or save them as a *Saved configuration*.

### 3.6 Packet capture

Record traffic to a pcap file and download it.

**Steps**:

1. Choose **interfaces** (several allowed)
2. Optionally choose a **filter** (otherwise everything is recorded)
3. Set **Seconds to live** (5 by default; recording stops by itself)
4. Choose **Storage** and **Directory** (the card shows used and free space)
5. **Start capture** → confirm

Files appear in the list below as they are written, marked *writing* while open, and can be downloaded once closed.

**Worth knowing**:

- A capture is a **parallel, temporary configuration**. It runs alongside the running one and **never touches run.xml**
- Both starting and stopping make the device **re-read its running configuration**, which is why both ask first
- Seconds-to-live only stops the recording; the configuration is cleared by **Stop**

**Rewrite warning**: if the chosen ingress feeds a chain whose output **rewrites packets**, Studio says so — what you record may not be the original packet, and it risks destabilising the device. You can then:

- Capture anyway, accepting the risk
- Or let Studio **rewrite the XML for you**: the output is detoured through a LOOP interface so the original packets are recorded. The edited configuration is handed to the Export page for you to read and submit yourself.

**Live packet view (Wireshark-style)**:

With it enabled, packets appear on screen as the capture runs — list, decoded detail, hex dump.

- It can be switched on or off **before** starting
- **Packets kept** is adjustable (200 / 500 / 1000 / 2000 / 5000); older ones fall off the top
- **Up and down arrows** move the selection
- The filter box understands `not` / `and` / `or` and brackets
- Navigate away and back while a capture is still running and the live view **reopens itself**

> 💡 The filter matches **the decoded field text**, not Wireshark's filter syntax.

---

## 4. Traffic

Requires a session. Every page has its own refresh interval (10 seconds by default).

| Tab | Contents |
|---|---|
| **Interfaces** | Per-port link state, rate, packets, bytes, errors, drops |
| **Sessions** | IPv4 / IPv6 session table: totals, concurrent, NetFlow records, protocol and port distribution |
| **Services** | Services identified by the ports their traffic uses. Click a row for the hosts behind it — the top 100 talkers. *Public* is traffic to and from the internet; *private* stays inside your network |
| **Countries** | Packets, bytes and share per country |
| **L2GRE Correlation** | Only where L2GRE correlation is switched on |
| **MEC Mapping Table** | Only where S1AP correlation is switched on |

**Clear counters** — zeroes the statistics and starts again. Traffic itself is unaffected.

---

## 5. System

### 5.1 System status

Host, uptime, device time, load average, CPU (overall and per core), memory, disk, fans, temperatures, power.

The **memory card** lists what is **reserved at startup** separately — DPDK hugepages and the flow tables — and computes usage against the total minus those, so the percentage means something.

### 5.2 System log

The device's own log. **follow** keeps it scrolled to the newest lines.

### 5.3 Settings

Settings is divided into sections (switch at the top). Which appear depends on the model:

| Section | Contents |
|---|---|
| **System** | Management addresses, NTP time servers, time zone, DNS, power (reboot / shut down) |
| **Interfaces** | Per-port enable, speed, description, VPORT, LAN-bypass relays |
| **Switch Interface** | Only models with a Marvell switch in front of the engine (the Q16, for one). See the warning below |
| **Packet handling** | Flow table sizes, deduplication, IP fragment and TCP reassembly, tunnel parsing, heartbeat, MEC / SD-WAN |
| **Login authentication** | Internal accounts, *Change my password*, RADIUS / TACACS+ |
| **Logging** | Syslog, NetFlow, DNS and TLS logging destinations |
| **Services** | Per-service enable, state and version; the **Crash debugging** card lives here too |
| **Backup & restore** | Download a backup, restore from file, factory reset |
| **Firmware** | Current version, upload an image, online update |
| **Raw configuration** | Edit the device's XML directly |

Every section applies through a confirmation.

> ⚠️ **Switch Interface**: every write restarts the switch service, and **about twenty seconds with every port down**. If that service stops on its own you get sixteen dark ports with a perfectly healthy packet engine — the same card restarts it.

### 5.4 Crash debugging

Settings → Services → **Crash debugging**

If the packet engine (grism) dies, this card is how the evidence comes back and how service is restored.

**Engine status line** — a green or red dot for whether the engine answers, and how many of its processes are alive. A partial death — sixteen down to eight — is visible here and nowhere else.

**Build identity line** — model, firmware version, and the first twelve of the revision, with a **Copy for report** button. **Include this when reporting a problem**: without the revision, a core dump cannot be matched to its source.

**Write a core dump when the engine crashes** — with this ticked:

- It applies to the **already running** processes immediately, no restart needed
- It survives a reboot
- A crash writes a dump, listed below for download
- The newest **2** are kept

Above the list is a `MANIFEST.txt` link recording the firmware the dumps came from — **send it with the dump**.

**Restart engine / Reboot device** — whichever the platform supports:

- Where the engine can be restarted in place, the button restarts it, no reboot
- On platforms whose engine can only start once per boot, the button offers a **reboot** and the confirmation says why

> ⚠️ On some platforms the dumps are held in memory and **a reboot deletes them** — the confirmation warns, so download first.

---

## 6. Common workflows

### Add a forwarding rule

1. Sign in → **load running**
2. **Filters**: add a filter and give it its conditions
3. **Chains**: pick (or add) a chain, insert a filter node where it belongs, and set where *match* and *not match* each go
4. **Simulate**: choose the ingress port and try the combinations; confirm the path
5. **Export**: read the diff
6. **submit to device**

### Record traffic for analysis

1. Sign in → **Pipeline → Capture**
2. Choose interfaces, optionally a filter, seconds to live, storage
3. If the rewrite warning appears, consider letting Studio rewrite it through a LOOP interface
4. **Start capture** — turn on the live view if you want to watch it arrive
5. Download the pcap from the list
6. **Stop** to clear the capture configuration

### Go back a version

1. **Export** → the version list below (automatic snapshots, five kept)
2. Load one → read the diff
3. **submit to device** once it looks right

### After the engine crashes

1. Sign in → **Settings → Services → Crash debugging**
2. Tick *Write a core dump when the engine crashes* (worth leaving on)
3. Once it happens again, **download the dump and `MANIFEST.txt`**
4. Press **Copy for report** and send that along with the dump
5. Restore service with *Restart engine* or *Reboot device*

---

## 7. Troubleshooting

| What you see | Why, and what to do |
|---|---|
| Every panel fails to load | The session has probably ended; Studio notices and asks you to sign in again |
| A brief error right after submitting | The device is re-reading its configuration; it passes in a few seconds |
| Everything greyed out, banner at the top | You are signed in as a read-only account |
| Cannot submit — *fix issues to submit* | Click the problem indicator and **jump** to each one |
| An edit seems to have no effect | Check the sync indicator: edits that were never submitted exist only in the browser |
| No capture file appears | Check the chosen interface is actually carrying traffic; a LOOP port needs something sent into it |
| A filter condition seems inert | Make sure the field came from the list — names the firmware does not implement are ignored |
| Sixteen dark ports, engine fine (Q16) | The switch service has probably stopped; restart it in **Switch Interface** |

---

## Appendix: keyboard

| Key | Does |
|---|---|
| `↑` `↓` | Move the selected packet in the live view |
| `Ctrl` + wheel | Zoom the chain canvas |
| `Esc` | Close a dialog |
