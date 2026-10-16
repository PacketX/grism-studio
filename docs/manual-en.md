# GRISM Studio Operations Manual

GRISM Studio is the web interface of the GRISM packet broker. Open it in a browser; nothing is installed.

Enter the device's management IP in the browser; the factory default is `192.168.1.150`. The device redirects to `https://192.168.1.150/grism-studio/` by itself (HTTP is redirected to HTTPS too).

The screens in this manual are GRISM Studio 2.260 on a G8S-MEC; other models differ in their port count and settings sections.

---

## 1. Getting started

### 1.1 Signing in and account levels

Account menu (top right) → **login**, then the device's username and password.

![Account menu: who is signed in, language, appearance, the Studio version](img/manual/account-menu.png)

**You can look around without signing in**: Studio loads a template so you can learn the interface and try editing. These actions need a session:

- Loading the device's running configuration
- Submitting a configuration
- Traffic statistics, system status, system log
- Packet capture

The session survives a page refresh.

**Accounts have four levels**, set under Settings → Login authentication → Local accounts:

| Level | May |
|---|---|
| **view** | read everything and edit the browser's draft; submit nothing |
| **operator** | + the packet path: submit filters and chains, replays and pcap files, packet capture, clearing counters and the MEC table, bypass relays, acknowledging alerts |
| **config** | + the device's settings: packet processing parameters, timezone, SNMP, services, alerts, switch, crash debugging, reboot |
| **admin** | + accounts, login servers, the management IP, management access list, firmware, backup and restore, halt |

A button above your level is greyed out, and pressing it anyway names the level it needs. Every account can **change its own password**; for a view-level account that is the only card the settings page shows. At least one administrator must remain: the last one cannot be deleted or demoted.

### 1.2 Layout

The top navigation has four workspaces; click one to open its tabs:

| Workspace | Purpose |
|---|---|
| **Overview** | What the loaded configuration does, in words |
| **Pipeline** | The main editing workspace |
| **Traffic** | Live interfaces, sessions, services, countries, the MEC mapping table |
| **System** | Device status, log, settings |

### 1.3 The toolbar

**Load device config** — fetches the running configuration and opens it for editing. If there are unsubmitted changes, it asks first.

To its right is the **sync indicator**:

- **In sync** — what you are editing is exactly what the device runs
- **Unapplied changes** — something was edited but not submitted

**Problems and warnings** — shows "valid" or "N problems / N warnings". Click for the list; every entry has "go to", which jumps to the place. Nothing can be submitted while there are problems.

**Undo / redo (↶ ↷)** — only in the Pipeline workspace. Each section (filters, inputs, outputs, actions, chains) keeps its own history.

**The alerts bell** — the device's current alerts. With alerts open the bell shows their number; click it for the list and to acknowledge them (see the Alerts section in 5.3).

![The alerts bell](img/manual/alerts-bell.png)

**Account menu** — sign in / out, language (中文 / English), appearance (light / dark), and the Studio version at the bottom.

### 1.4 Where the configuration came from

The toolbar names the source of the current configuration:

- **The device's running configuration** — loaded from the device, the usual starting point
- **The "XXX" template** — a built-in example, not yet adjusted for this device
- **Manually entered configuration** — XML pasted or edited on the Export page

> ⚠️ Submitting a **template** gets an extra warning in the confirmation: its ports and parameters may not fit this device.

---

## 2. Overview

Once a configuration is loaded, this page says in plain words what it does: how many filters and chains, which ports, and **what it looks like**.

![Overview: the inferred purpose and the filter list](img/manual/overview.png)

The inferred purpose is read from the configuration's structure, and its first line names the device's role — MEC breakout (which port strips GTP, which edge host it goes to, which port wraps it again, whether a cell decides), or an SD-WAN tunnel (L2GRE / VXLAN, which ports, the tunnel's VLAN, single-armed or not, linkdown failover) — followed by structural observations such as bidirectional forwarding, load balancing or drops. It is an inference; the chains and filters listed below it are exact.

**Hover a filter or an output for its full conditions and actions** — a chain can be understood without switching tabs. When a condition is made of several filters it is marked "all match" (and) or "any match" (or); a filter with `blockifempty` has its meaning flipped in the text.

---

## 3. Pipeline

The core workspace. Three concepts first:

```
filters (match conditions)  →  chains (decide where)  →  outputs (which port, what changes)
```

- A **filter** defines "what kind of packet", and can be reused
- A **chain** strings ingress ports, filters and outputs into a decision path
- An **output** says which port, and whether to rewrite, encapsulate or duplicate

### 3.1 Chains

The canvas in the middle draws one chain as a flow. The chain list is on the left (drag to reorder); the editor column on the right.

![Chains: the list, the canvas, the editor column](img/manual/chain.png)

**Node types**:

| Node | Meaning |
|---|---|
| **Ingress** | which ports the traffic enters on; always at the top |
| **Filter** | a decision, with a "match" leg (solid green) and a "no match" leg (dashed red) |
| **Output** | which ports or named outputs (`O1`…) |
| **Drop** | not forwarded |
| **Unset** | this leg has no destination yet; a chain needs at least one leg with one |

**How to work it**:

- Click a node → the editor column on the right edits it; the top of the column shows the node's place in the chain (ingress → … → this node), and each step is a link to that node
- **Hover a node for a tip**: ingress and output nodes show port names and descriptions plus the advanced VLAN operations (tag / strip); a filter node shows the conditions it really matches
- An output node's editor offers "+ filter (this → match)" and "(this → no match)" to insert a decision above it, choosing which leg keeps this output
- A filter node's editor offers "− filter" to remove the decision, keeping either the match or the no-match leg and joining it to the level above; the other leg goes with the filter
- An edit moves the node you changed and nothing else
- `Ctrl` + mouse wheel zooms the canvas, dragging empty space pans, "fit" shows the whole chain

**Output mode**: with several ports choose "duplicate" (every port gets a copy) or "load balance" (split by the chosen fields).

### 3.2 Filters

Pick a filter on the left, edit its conditions on the right.

![Filters](img/manual/filters.png)

Conditions form a tree: `and` (all), `or` (any), `not`. Each condition is a field, a relation and a value, such as "`vlan.id` == `921`".

The fields cover L2 to L7 (MAC, VLAN, IP, ports, TCP flags, TLS/JA4, DNS, GTP, HTTP, the MEC cell, …). **The field list is the firmware's** — a name the firmware does not know is silently ignored, so pick from the list rather than typing an unlisted name.

Deleting a filter selects the **next** one (not the first). Inputs, outputs, actions and chains behave the same.

### 3.3 Advanced: inputs, outputs, actions

These three tabs sit in the "Advanced" group and show when it is opened.

**Inputs** — traffic sources that are not physical ports: a pcap replay (`replayPcap`), a traffic generator.

> ⚠️ `replayPcap` **transmits out of the port** rather than injecting ingress traffic. For the packets to enter the pipeline the port has to be a LOOP port.

**Outputs** — named outputs (`O1`, `O2`…), which can:

- rewrite the packet (MAC / IP / ports / TCP MSS)
- add or strip VLAN tags (Q / QinQ)
- encapsulate (VXLAN / NVGRE / GRE / UDP) or decapsulate (GTP, GRE, VXLAN, MPLS, …)
- answer, mirror, redirect
- cap the rate, cap the packet length
- write to storage (pcap files)

**Actions** — ingress-side processing such as ARP / ICMP replies, ingress VLAN operations, heartbeat probing, and link pairs (one side down forces the other down).

### 3.4 Simulate

See where a packet goes before touching the device.

![Simulate: the device's ports above, the ingress port and each filter's verdict on the left](img/manual/simulate.png)

1. Pick an **ingress port**
2. Set each filter to "match" or "no match" (or all at once)
3. Press "▶ play": packets are sent continuously and the animation shows their path

**Inline devices**: add a virtual inline device (an IPS, say) between two ports. A packet leaving on port A comes back on port B, and if B has a chain of its own the packet continues down it — the full path of a chained deployment.

**Inputs**: an input in the configuration (replay, generator) starts at its port; click its badge to send from there. If that port is neither a LOOP port nor wired to an inline device, the panel says the packet leaves the device and enters no chain.

**Follow the device**: the toggle beside play. Studio then reads the device's port and filter counters, draws the traffic really flowing on each port and checks it against the configuration — ports no chain uses, ports the configuration uses but that are down, LOOP returns, output drops. An inline device drawn on the panel is taken as really wired.

Filters and outputs show their details on hover here too.

### 3.5 Export and submit

This page shows the complete configuration XML, and is where it is submitted.

![Export: the XML on the left; validation, saved configurations and previous versions on the right](img/manual/export.png)

**Changes (diff)** — whenever the configuration differs from what was loaded, the whole file's diff is shown, added and removed lines in colour. Click the change count to **jump block by block** ("+" to the next addition, "−" to the next removal).

**Submit to device** — replaces the running configuration and applies it at once. Not possible while there are problems.

**Previous versions** — before every submit, Studio keeps the configuration the device was running, up to **10**, the oldest removed automatically. Load any of them here, review the diff and submit it back; or delete them. They are kept apart from the saved configurations below.

**Saved configurations** — versions you saved and named. Expand to load, re-describe or delete.

**Edit / format / copy** — edit the XML text and "apply", or copy the whole configuration.

**Other configuration files** — at the bottom. Besides the running run.xml the device may hold other files (a large filter list as `run<N>.xml`, for instance); view them here.

> 💡 Unsubmitted changes **live only in the browser**. Closing the tab or refreshing loses them: submit, or save a configuration.

### 3.6 Packet capture

Record traffic to a pcap file and download it.

![Packet capture](img/manual/capture.png)

**Steps**:

1. Choose the **interfaces** (several allowed)
2. Choose a **filter** or none (none records everything)
3. Set the **lifetime** in seconds (5 by default; it stops by itself)
4. Choose the **storage** and **directory** (the card shows used / free space)
5. "Start capture" → confirm

Files appear in the list below as they are written, marked "writing" while open. Download when done.

**Worth knowing**:

- A capture is a **parallel, temporary configuration** that runs alongside the running one and **never touches run.xml**
- Both starting and aborting make the device **re-read its running configuration**, which is why both ask for confirmation
- The lifetime only stops recording; "abort" removes the capture configuration

**The rewrite warning**: if a chosen ingress port leads, through its chain, to an **output that rewrites packets**, Studio warns — what is recorded may not be the original packet, and there is a risk to the system. Then either:

- continue anyway (accepting the risk), or
- let Studio **rewrite the configuration**: with enough free LOOP ports each rewriting output is first sent round a LOOP port, where the original packet is recorded; without enough, VLAN tags tell the copies apart. The result is loaded on the Export page for you to review and submit.

**Live packet view (Wireshark-style)**:

With it on, packets show on screen while the capture runs — list, decoded detail, hex dump. A packet inside a GRE or VXLAN tunnel is listed as the inner packet.

- Choose it **before** starting the capture
- The **retained count** is adjustable (200 / 500 / 1000 / 2000 / 5000); older packets fall off the top
- **Up / down arrows** move the selection
- Filter expressions take `not` / `and` / `or` and parentheses
- Leaving the tab and coming back while the capture runs **reopens** the live view

> 💡 The filter matches the **decoded field text**, not Wireshark's filter syntax.

---

## 4. Traffic

Needs a session. Every tab has an auto-refresh interval (10 s by default).

![Traffic: interfaces](img/manual/traffic-ports.png)

| Tab | Content |
|---|---|
| **Interfaces** | each port's link, rate, packets, bytes, errors, drops; disabled ports are greyed, virtual and physical ports listed together |
| **Sessions** | the IPv4 / IPv6 session tables: totals, live count, NetFlow records, protocol and port distribution |
| **Services** | services recognised by port. Click a row for the hosts behind it (top 100 by traffic), public and private apart |
| **Countries** | packets, bytes and share per country |
| **L2GRE mapping** | only with L2GRE mapping enabled |
| **MEC mapping table** | only with S1AP/NGAP correlation enabled: each UE's address, base station, cell, uplink and downlink tunnels and traffic; sortable by column, filterable by address or idle time |

![Traffic: the MEC mapping table](img/manual/traffic-mec.png)

**Clear counters** — resets the statistics; traffic is unaffected. The MEC table has its own "clear", which removes entries idle longer than a given number of seconds.

---

## 5. System

### 5.1 System status

![System status](img/manual/status.png)

Model, version, serial, machine id, host name, uptime, device time, load average; a **current settings** card with the management IP, NTP, timezone, the packet-processing features and services in use; then CPU (per core), memory, disks, temperatures, fans and power. Open alerts are listed on this page too.

The **memory card** separates what is **pinned at boot** — DPDK hugepages and the flow table — and computes the usage from what remains, so the percentage means something.

### 5.2 System log

![System log](img/manual/syslog.png)

The device's log. "Auto-scroll" follows the newest lines.

Past 10 MB the device rotates the log to `log.txt.1`, older ones on to `.4`. When older files exist a file list appears beside the title to view any of them; "download all (zip)" packs the current and every older file into one zip. "Clear" deletes all of them, rotated ones included; only an administrator can, and the device records who did.

### 5.3 Settings

The settings page has several sections (switched at the top); models differ a little in which they show:

![Settings: the packet processing section](img/manual/set-packet.png)

| Section | Content |
|---|---|
| **System** | management IP, NTP server, timezone, DNS, power (reboot / halt) |
| **Interfaces** | each port's enable, speed, description, VPORT, LAN-bypass relays |
| **Switch interfaces** | only on models with a Marvell switch in front (the Q16). See the warning below |
| **Packet processing** | session tracking, deduplication, fragments and reassembly, live filter updates, tunnel inspection, heartbeat, MEC (S1AP/NGAP · GTP), SD-WAN tunnels, traffic classification |
| **Login authentication** | local accounts and levels, change my password, RADIUS / TACACS+, Allow Local Login Hosts |
| **Logging** | syslog, NetFlow, DNS log, TLS log and the other outputs |
| **Services** | each service's state, enable and version; manual component update, service options, management access list, SNMP; the **crash debugging** card is here too |
| **Alerts** | alert rules and thresholds, SNMP trap targets |
| **Backup and restore** | download a backup, restore from file, factory reset |
| **Firmware** | current version, upload firmware, online update |
| **Raw configuration** | edit the device's XML configuration directly |

Each section is written to the device only after "apply" and a confirmation.

**Login authentication**

![Settings: login authentication](img/manual/set-auth.png)

The local accounts table lists every account with its level; add, delete or re-level them (except the last administrator). With RADIUS or TACACS+ on, sign-ins go to the server; the addresses or networks under "Allow Local Login Hosts" still sign in with local accounts and never ask the server — leave one for the management network, so a dead server does not lock you out.

**The MEC (S1AP/NGAP · GTP) card** (packet processing)

Switches on the three features MEC breakout needs together (S1AP/NGAP correlation, GTP tunnel inspection, the GTP tunnel-header flow extension), and sets the table size, how many high bits of the NR Cell Identity make the 5G cell id (`nrCellIdentityBits`, 26 by default), and the periodic sweep of idle entries (a cron line and an idle limit, which the card translates into words). The card links to the "4G/5G mobile edge computing breakout" template, which builds the whole chain set in the editor; put in the real ports and addresses.

**Alerts**

![Settings: alerts](img/manual/set-alerts.png)

The device checks every 10 seconds whether or not anyone has the page open. Rules: CPU (packet engine excluded), memory, disks, temperature, fan failure, packet-engine zombie processes, a service not running, input drops, MEC table fill; each has a threshold, a clear threshold and a hold time. Raising and clearing are written to the system log and sent as SNMPv2c traps to the "SNMP trap targets" (several allowed; "send a test trap" checks the receiver at once); syslog goes out through "Logging". The boot, shutdown and power notifications come from the `packetx_trap_dispatcher` service, enabled under Services.

**Services**

![Settings: services](img/manual/set-services.png)

> ⚠️ **Switch interfaces**: every write restarts the switch service, during which **every port is down for about 20 seconds**. If the service stops on its own you see sixteen dark ports with the packet engine itself fine — the same card's restart brings it back.

### 5.4 Crash debugging

Where: Settings → Services → Crash debugging

If the packet engine (grism) dies, this card is the evidence and the recovery.

**Engine state row** — green / red for alive or not, and the process count. If only some processes are alive (8 of 16, say), it shows here.

**Build row** — model, firmware version and the first 12 characters of the revision, with a "copy report info" button. **Include this when reporting** — without the revision a core dump cannot be matched to the source.

**Write a core dump when the engine crashes** — when ticked:

- takes effect on the **running** processes at once, no restart
- stays on across reboots
- on a crash the system writes the dump, listed below for download
- keeps the newest **2**

Above the list is a `MANIFEST.txt` link recording which firmware the dumps belong to — **send it with the dumps**.

**Restart engine / reboot** — the button the platform supports:

- models that can restart the engine live show "restart engine", no reboot
- on some models the engine can start only once per boot: the button says "**reboot**" and the confirmation explains why

> ⚠️ On some models the dumps live in memory and a **reboot deletes them** — the confirmation says so; download first.

---

## 6. Common workflows

### Add a forwarding rule

1. Sign in → **load device config**
2. **Filters**: add a filter and its conditions
3. **Chains**: pick a chain (or add one), insert the filter node where it belongs, set where "match / no match" go
4. **Simulate**: pick the ingress port, try the combinations, confirm the paths
5. **Export**: review the diff
6. **Submit to device**

### Record traffic for analysis

1. Sign in → **Pipeline → Packet capture**
2. Choose interfaces, optionally a filter, the lifetime and the storage
3. If the rewrite warning appears, consider letting Studio rewrite the configuration the LOOP way
4. "Start capture" → open the live view to check as it runs, if useful
5. Download the pcap from the list when done
6. "Abort" to remove the capture configuration

### Go back a version

1. **Export** → "previous versions" on the right (kept automatically, up to 10)
2. "Load" one → review the diff
3. **Submit to device**

### Set up MEC breakout

1. Settings → Packet processing → the **MEC (S1AP/NGAP · GTP)** card: switch it on, apply
2. The card's "4G/5G mobile edge computing breakout" template → in the editor, replace the ports and addresses with the real ones (base-station side, core side, edge host)
3. Traffic → **MEC mapping table**: confirm the UEs are learned and their cell values, then put the cell condition into the filter
4. Simulate, export, submit

### After the engine crashes

1. Sign in → **Settings → Services → Crash debugging**
2. Tick "write a core dump when the engine crashes" (best left on)
3. After the problem recurs, **download the dumps and `MANIFEST.txt`**
4. "Copy report info" and send it with the dumps
5. "Restart engine" or "reboot" to restore service

---

## 7. Troubleshooting

| Symptom | Cause and remedy |
|---|---|
| Every panel fails to load | The session has probably expired; Studio notices and asks you to sign in again |
| Errors right after a submit | The device takes a few seconds to re-read its configuration; normal |
| Buttons are grey, and pressing one names a level | The signed-in account is below that level; an administrator changes levels under Login authentication |
| Cannot submit: "fix the problems first" | Click the problems indicator and "go to" each one |
| A change did not take effect | Check the sync indicator says "in sync" — edited but unsubmitted content lives only in the browser |
| No capture file appears | Check the chosen interface carries traffic; a LOOP port needs something sent into it |
| A filter condition seems to do nothing | Check the field was picked from the list; the firmware ignores unknown fields |
| Sixteen dark ports with the engine fine (Q16) | The switch service may have stopped; restart it under Switch interfaces |
| The bell always shows an alert | System status says which rule; thresholds are under Settings → Alerts, and an acknowledged alert is quiet for a while |
| The online update says there is no image for this model | The newest release folder has none for it; upload the firmware instead |

---

## Appendix: keyboard

| Key | Effect |
|---|---|
| `↑` `↓` | move the selection in the live packet view |
| `Ctrl` + wheel | zoom the chain canvas |
| `Enter` / space | select the highlighted chain in the list |
| `Esc` | close pop-ups |
