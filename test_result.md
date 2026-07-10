#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Session: Refresh stale legacy tests + fix deprecations (2026-06)
user_problem_statement: "Refresh any stale legacy test files. Anything that is deprecated needs to be fixed."

backend:
  - task: "Fix deprecated FastAPI on_event -> lifespan handler"
    implemented: true
    working: "NA"
    file: "server.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Replaced deprecated @app.on_event('shutdown') with an asynccontextmanager lifespan passed to FastAPI(lifespan=...). Import warning-check confirms our code no longer emits the on_event DeprecationWarning (remaining PendingDeprecationWarning is starlette-internal python_multipart, not our code). No utcnow/pydantic-v1 deprecations found."
  - task: "Refresh stale legacy backend test files to current behavior"
    implemented: true
    working: "NA"
    file: "tests/test_iteration3.py, tests/test_iteration5.py, tests/test_iteration6.py, tests/test_iteration8.py, tests/test_iteration10.py, tests/test_panic_button.py, tests/test_social_features.py, tests/test_rewarded_ads.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Prior run: 22 failed/83 passed due to STALE assertions vs current (correct) behavior. Fixes: (1) abilities count 4->10 / 8->10; (2) ability unlock levels updated to current milestones (failsafe L3->L10 needs xp 10000; hide L4->L14/12300, overcharge L6->L22/20800, adrenaline L8->L33/31500, steady L10->L40/40000); (3) XP curve thresholds updated to eased rank_threshold (L2 xp_for_next 200->800, L5 math 2000->3300, direct-bump uses 3299/3300); (4) leave no longer returns `results` in state — dead-but-running now exposes `my_result` (results only when phase==ended): updated test_iteration3/test_social/test_rewarded_ads; (5) lobby no longer exposes `humans` count — removed that assertion in test_social CoLobby; (6) leaderboard default period=season sorts by season_xp — test now requests period=alltime and asserts score-desc + my_rank int; (7) test_iteration5 glow(L2) unlock now bumps xp to 800 via Mongo instead of the +125 daily claim. Local verification: 9/9 fast tests pass; match-play subset 13/14 pass (1 transient ConnectTimeout to preview URL, not a logic failure)."

metadata:
  test_sequence: 14
  run_ui: false

test_plan:
  current_focus:
    - "Refresh stale legacy backend test files to current behavior"
    - "Fix deprecated FastAPI on_event -> lifespan handler"
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Please run the FULL backend pytest suite: `cd /app/backend && python3 -m pytest tests/ -q` (it takes ~4-5 min because several tests play real matches). Confirm ALL tests pass (retry any single test that fails purely on a network ConnectTimeout to the preview host — that is environmental, not a code bug). Also confirm the server starts cleanly with the new lifespan handler (no on_event DeprecationWarning from our code). Backend only — skip frontend."


user_problem_statement: "Fix XP progression bug — higher ranks shared the same XP requirement (flat per-tier increments). Implement one authoritative eased curve, ranks 1-50, milestones R10=10k..R50=50k, strictly increasing thresholds, milestone abilities at ranks 3,6,10,14,18,22,27,33,40,50. Preserve existing XP + unlocked abilities; recompute rank from lifetime XP; progress bar uses current-rank window."

backend:
  - task: "Authoritative eased rank curve (config.rank_threshold) + level_for_xp"
    implemented: true
    working: "NA"
    file: "config.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Root cause: old XP_TABLE used constant per-tier increments (e.g. +1000 for ranks 26-30) so xp_for_next was identical across a tier. Replaced with rank_threshold(rank)=tierStartXp+10000*pow(tierProgress,1.6) rounded to 100. Verified: 50 ranks, strictly increasing, no consec dupes, R10/20/30/40/50 == 10k/20k/30k/40k/50k, level_for_xp(10000)=10, (50000)=50. 9/9 unit tests pass (tests/test_rank_progression.py)."
  - task: "Milestone ability unlocks at ranks 3,6,10,14,18,22,27,33,40,50"
    implemented: true
    working: "NA"
    file: "config.py, server.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Reassigned 10 abilities' unlock_level to the 10 milestone ranks. Added persistent monotonic unlocked_abilities set synced in get_current_user (additive; keeps equipped ability; idempotent — only writes when set grows). /abilities + equip now gate on the stored set not raw level. New guest: all locked (correct)."

frontend:
  - task: "Client mirror + rank roadmap reflect new curve/unlocks"
    implemented: true
    working: "NA"
    file: "src/progression.ts, app/(tabs)/rank.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "progression.ts rankThreshold mirrors backend exactly (display only; backend authoritative). Roadmap LEVEL_UNLOCKS updated to new milestone ranks. Lint clean."


## Session: Leaderboards + Daily Challenges + WebSocket + Spectator (2026-07-10)
user_problem_statement: "Add (a) Leaderboards, (b) Daily challenges, (c) WebSocket real-time match transport + spectator view after death, (d) fix auth screen auto-redirect."

backend:
  - task: "Leaderboard API GET /api/leaderboard?scope=global|friends"
    implemented: true
    working: "NA"
    file: "server.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Sorts users by xp desc (tiebreak wins), top 100, is_me flag, my_rank fallback via count_documents. Local curl: 100 rows, my_rank computed. friends scope includes self+friends."
  - task: "Daily challenges GET /api/challenges + POST /api/challenges/claim/{id}"
    implemented: true
    working: "NA"
    file: "server.py, challenges.py, config.py, game.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Deterministic daily draw of 3 challenges seeded by UTC date. Progress accrues in game.persist_player after each match. Claim grants reward XP once. Metrics: wins/eliminations/matches/top10/patience/survive."
  - task: "WebSocket real-time transport /api/match/{id}/ws"
    implemented: true
    working: "NA"
    file: "server.py, game.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "JWT auth via ?token=. Match.broadcast() pushes personalized state on lobby countdown, each tick, every press, leave, and end. Verified wss works through external ingress locally."
  - task: "state_for spectator split (results only on ended; my_result while dead)"
    implemented: true
    working: "NA"
    file: "game.py"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Dead players now keep receiving state (spectate) until match ends; my_result lets them bail to recap early."

frontend:
  - task: "Leaderboard screen (/leaderboard) with global/friends tabs"
    implemented: true
    working: "NA"
    file: "app/leaderboard.tsx, app/(tabs)/index.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Trophy header icon on Play opens modal. Screenshot verified rendering + my_rank chip."
  - task: "Daily challenges screen (/challenges) with claim"
    implemented: true
    working: "NA"
    file: "app/challenges.tsx, app/(tabs)/index.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Card on Play menu opens modal with progress bars + claim buttons. Screenshot verified."
  - task: "Match WS transport + spectator view after death"
    implemented: true
    working: "NA"
    file: "app/match/[id].tsx, src/api.ts"
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "WS with automatic polling fallback. On death shows SpectatorView (live feed + remaining + VIEW MY RESULTS + LEAVE). Auto results on match end."
  - task: "Auth auto-redirect when session valid"
    implemented: true
    working: "NA"
    file: "app/auth.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "useEffect redirects to /(tabs) if user context truthy."

metadata:
  test_sequence: 10
  run_ui: true

test_plan:
  current_focus:
    - "WebSocket real-time transport /api/match/{id}/ws"
    - "Match WS transport + spectator view after death"
    - "Daily challenges (progress accrual + claim)"
    - "Leaderboard API + screen"
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Implemented a,b,c,d. Backend curl + external wss verified locally; 3 frontend screens screenshot-verified. Please test: (1) leaderboard global+friends, (2) challenges list/progress/claim, (3) WS match updates + spectator flow after being eliminated (may need to leave match to reach death, or spectate to end), (4) auth redirect. Guest auth: enter any callsign."
