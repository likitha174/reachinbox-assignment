import { useEffect, useState } from "react";
import "./App.css";

type Sender = {
  id: string;
  email: string;
  name?: string | null;
};

type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
};

type SlackStatus = {
  connected: boolean;
  workspaceName: string | null;
  workspaceId: string | null;
};

type Email = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledTime: string;
  sentAt?: string | null;
  status: "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";
  sender?: Sender | null;
};

const API_URL = "http://localhost:5200";

function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const [slackStatus, setSlackStatus] = useState<SlackStatus>({
    connected: false,
    workspaceName: null,
    workspaceId: null,
  });

  const [activeTab, setActiveTab] = useState("all");
  const [showCompose, setShowCompose] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [selectedSender, setSelectedSender] = useState("");

  const [delaySeconds, setDelaySeconds] = useState("1");
  const [hourlyLimit, setHourlyLimit] = useState("100");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvCount, setCsvCount] = useState(0);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingSlack, setLoadingSlack] = useState(false);

  // -----------------------------
  // Google authentication
  // -----------------------------

  const loadCurrentUser = async () => {
    try {
      setLoadingUser(true);

      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const data = await response.json();
      setUser(data.user || null);
    } catch (error) {
      console.error("Failed to load current user:", error);
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  };

  const loginWithGoogle = () => {
    window.location.href = `${API_URL}/api/auth/google`;
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setUser(null);
    }
  };

  // -----------------------------
  // Slack
  // -----------------------------

  const loadSlackStatus = async () => {
    try {
      setLoadingSlack(true);

      const response = await fetch(`${API_URL}/api/slack/status`);

      if (!response.ok) {
        throw new Error("Failed to load Slack status");
      }

      const data = await response.json();

      setSlackStatus({
        connected: !!data.connected,
        workspaceName: data.workspaceName || null,
        workspaceId: data.workspaceId || null,
      });
    } catch (error) {
      console.error("Slack status error:", error);
    } finally {
      setLoadingSlack(false);
    }
  };

  const connectSlack = () => {
    const popup = window.open(
      `${API_URL}/api/slack/connect`,
      "slack-oauth",
      "width=600,height=700,left=200,top=100"
    );

    if (!popup) {
      setMessage(
        "Popup was blocked. Please allow popups and try again."
      );
      return;
    }

    const checkConnection = window.setInterval(async () => {
      if (popup.closed) {
        window.clearInterval(checkConnection);
        await loadSlackStatus();
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/api/slack/status`
        );

        if (response.ok) {
          const data = await response.json();

          if (data.connected) {
            setSlackStatus({
              connected: true,
              workspaceName: data.workspaceName || null,
              workspaceId: data.workspaceId || null,
            });

            window.clearInterval(checkConnection);
          }
        }
      } catch (error) {
        console.error("Checking Slack connection:", error);
      }
    }, 1500);
  };

  const disconnectSlack = async () => {
    try {
      setLoadingSlack(true);
      setMessage("");

      const response = await fetch(
        `${API_URL}/api/slack/disconnect`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to disconnect Slack"
        );
      }

      setSlackStatus({
        connected: false,
        workspaceName: null,
        workspaceId: null,
      });

      setMessage("Slack disconnected successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to disconnect Slack"
      );
    } finally {
      setLoadingSlack(false);
    }
  };

  // -----------------------------
  // Load emails
  // -----------------------------

  const loadEmails = async () => {
    try {
      setLoadingEmails(true);

      const response = await fetch(`${API_URL}/api/emails`);

      if (!response.ok) {
        throw new Error("Failed to load emails");
      }

      const data = await response.json();
      setEmails(data.emails || []);
    } catch (error) {
      console.error(error);
      setMessage("Unable to load emails. Please check the backend.");
    } finally {
      setLoadingEmails(false);
    }
  };

  // -----------------------------
  // Load senders
  // -----------------------------

  const loadSenders = async () => {
    try {
      setLoadingSenders(true);

      const response = await fetch(`${API_URL}/api/senders`);

      if (!response.ok) {
        throw new Error("Failed to load senders");
      }

      const data = await response.json();

      setSenders(data.senders || []);

      if (data.senders?.length > 0 && !selectedSender) {
        setSelectedSender(data.senders[0].id);
      }
    } catch (error) {
      console.error(error);
      setMessage("Unable to load senders. Please check the backend.");
    } finally {
      setLoadingSenders(false);
    }
  };

  useEffect(() => {
    loadEmails();
    loadSenders();
    loadCurrentUser();
    loadSlackStatus();
  }, []);

  // -----------------------------
  // Schedule single email
  // -----------------------------

  const scheduleEmail = async () => {
    if (!recipient || !subject || !body || !scheduledTime) {
      setMessage("Please fill all required fields.");
      return;
    }

    if (!selectedSender) {
      setMessage("Please select a sender.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(`${API_URL}/api/emails/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient,
          subject,
          body,
          scheduledTime,
          senderId: selectedSender,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to schedule email");
      }

      setMessage("Email scheduled successfully!");

      setRecipient("");
      setSubject("");
      setBody("");
      setScheduledTime("");

      await loadEmails();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // Read CSV recipients
  // -----------------------------

  const readCSVRecipients = (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const text = String(reader.result || "");

        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          resolve([]);
          return;
        }

        const firstLine = lines[0].toLowerCase();

        let recipients: string[] = [];

        if (
          firstLine.includes("email") ||
          firstLine.includes("recipient")
        ) {
          const headers = lines[0]
            .split(",")
            .map((header) => header.trim().toLowerCase());

          const emailIndex = headers.findIndex(
            (header) =>
              header === "email" ||
              header === "recipient" ||
              header === "email address"
          );

          if (emailIndex >= 0) {
            recipients = lines
              .slice(1)
              .map((line) => {
                const values = line.split(",");
                return (values[emailIndex] || "").trim();
              })
              .filter((email) => email.includes("@"));
          }
        } else {
          recipients = lines
            .map((line) => line.split(",")[0].trim())
            .filter((email) => email.includes("@"));
        }

        resolve([...new Set(recipients)]);
      };

      reader.onerror = () => reject(new Error("Unable to read CSV"));

      reader.readAsText(file);
    });
  };

  // -----------------------------
  // CSV file selected
  // -----------------------------

  const handleCSVChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;

    setCsvFile(file);
    setCsvCount(0);
    setMessage("");

    if (!file) {
      return;
    }

    try {
      const recipients = await readCSVRecipients(file);

      setCsvCount(recipients.length);

      if (recipients.length === 0) {
        setMessage("No valid email addresses detected in the CSV.");
      } else {
        setMessage(
          `${recipients.length} email address${
            recipients.length === 1 ? "" : "es"
          } detected.`
        );
      }
    } catch {
      setMessage("Could not read the CSV file.");
    }
  };

  // -----------------------------
  // Upload CSV
  // -----------------------------

  const uploadCSV = async () => {
    if (!csvFile || !subject || !body || !scheduledTime) {
      setMessage(
        "Select a CSV and fill subject, message and start time."
      );
      return;
    }

    if (!selectedSender) {
      setMessage("Please select a sender.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const recipients = await readCSVRecipients(csvFile);

      if (recipients.length === 0) {
        throw new Error("No valid email addresses found in the CSV.");
      }

      const delayMs = Math.max(
        0,
        Number(delaySeconds) * 1000
      );

      const startDate = new Date(scheduledTime);

      if (isNaN(startDate.getTime())) {
        throw new Error("Invalid start time.");
      }

      if (startDate <= new Date()) {
        throw new Error("Start time must be in the future.");
      }

      let successCount = 0;

      for (
        let index = 0;
        index < recipients.length;
        index++
      ) {
        const recipientEmail = recipients[index];

        const recipientTime = new Date(
          startDate.getTime() + index * delayMs
        );

        const response = await fetch(
          `${API_URL}/api/emails/schedule`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipient: recipientEmail,
              subject,
              body,
              scheduledTime: recipientTime.toISOString(),
              senderId: selectedSender,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              `Failed to schedule ${recipientEmail}`
          );
        }

        successCount++;
      }

      setMessage(
        `${successCount} emails scheduled successfully!`
      );

      setCsvFile(null);
      setCsvCount(0);
      setSubject("");
      setBody("");
      setScheduledTime("");

      await loadEmails();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "CSV upload failed"
      );
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // Filter emails
  // -----------------------------

  const filteredEmails =
    activeTab === "all"
      ? emails
      : emails.filter(
          (email) => email.status === activeTab
        );

  const scheduledCount = emails.filter(
    (email) => email.status === "SCHEDULED"
  ).length;

  const sentCount = emails.filter(
    (email) => email.status === "SENT"
  ).length;

  const failedCount = emails.filter(
    (email) => email.status === "FAILED"
  ).length;

  // -----------------------------
  // UI
  // -----------------------------

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logoIcon">R</div>
          <span>ReachInbox</span>
        </div>

        <nav>
          <button
            className={
              activeTab === "all"
                ? "navItem active"
                : "navItem"
            }
            onClick={() => setActiveTab("all")}
          >
            <span>▦</span>
            All Emails
          </button>

          <button
            className={
              activeTab === "SCHEDULED"
                ? "navItem active"
                : "navItem"
            }
            onClick={() => setActiveTab("SCHEDULED")}
          >
            <span>◷</span>
            Scheduled
          </button>

          <button
            className={
              activeTab === "SENT"
                ? "navItem active"
                : "navItem"
            }
            onClick={() => setActiveTab("SENT")}
          >
            <span>✓</span>
            Sent
          </button>

          <button
            className={
              activeTab === "FAILED"
                ? "navItem active"
                : "navItem"
            }
            onClick={() => setActiveTab("FAILED")}
          >
            <span>!</span>
            Failed
          </button>
        </nav>

        <div className="sidebarBottom">
          {loadingUser ? (
            <>
              <div className="userAvatar">...</div>

              <div>
                <strong>Loading...</strong>
                <small>Please wait</small>
              </div>
            </>
          ) : user ? (
            <>
              <div className="userAvatar">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>

              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>

                <button
                  type="button"
                  onClick={logout}
                  style={{
                    marginTop: "4px",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="userAvatar">?</div>

              <div>
                <strong>Not logged in</strong>

                <button
                  type="button"
                  onClick={loginWithGoogle}
                  style={{
                    marginTop: "4px",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Sign in with Google
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div>
            <h1>Email Scheduler</h1>
            <p>
              Manage your scheduled email campaigns
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {user && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {user.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                )}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <strong style={{ fontSize: "13px" }}>
                    {user.name}
                  </strong>

                  <span
                    style={{
                      fontSize: "11px",
                      color: "#777",
                    }}
                  >
                    {user.email}
                  </span>
                </div>
              </div>
            )}

            <button
              className="composeButton"
              onClick={() =>
                setShowCompose(!showCompose)
              }
            >
              + Compose Email
            </button>
          </div>
        </header>

        <section className="stats">
          <div className="statCard">
            <div className="statIcon blue">◷</div>

            <div>
              <span>Scheduled</span>
              <strong>{scheduledCount}</strong>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon green">✓</div>

            <div>
              <span>Sent</span>
              <strong>{sentCount}</strong>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon red">!</div>

            <div>
              <span>Failed</span>
              <strong>{failedCount}</strong>
            </div>
          </div>

          <div className="statCard">
            <div className="statIcon purple">✉</div>

            <div>
              <span>Total</span>
              <strong>{emails.length}</strong>
            </div>
          </div>
        </section>

        {/* -----------------------------
            Slack Integration
        ----------------------------- */}

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "18px 20px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "#f4f0ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
              }}
            >
              #
            </div>

            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "15px",
                }}
              >
                Slack Notifications
              </h3>

              {loadingSlack ? (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "#777",
                  }}
                >
                  Checking connection...
                </p>
              ) : slackStatus.connected ? (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "#16803c",
                  }}
                >
                  ● Connected to{" "}
                  <strong>
                    {slackStatus.workspaceName ||
                      "Slack workspace"}
                  </strong>
                </p>
              ) : (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "12px",
                    color: "#777",
                  }}
                >
                  Connect Slack to receive rate-limit alerts.
                </p>
              )}
            </div>
          </div>

          {slackStatus.connected ? (
            <button
              type="button"
              onClick={disconnectSlack}
              disabled={loadingSlack}
              style={{
                border: "1px solid #dc2626",
                background: "#fff",
                color: "#dc2626",
                borderRadius: "8px",
                padding: "9px 15px",
                cursor: loadingSlack
                  ? "not-allowed"
                  : "pointer",
                fontWeight: 600,
              }}
            >
              {loadingSlack
                ? "Disconnecting..."
                : "Disconnect Slack"}
            </button>
          ) : (
            <button
              type="button"
              onClick={connectSlack}
              disabled={loadingSlack}
              style={{
                border: "none",
                background: "#4a154b",
                color: "#fff",
                borderRadius: "8px",
                padding: "9px 15px",
                cursor: loadingSlack
                  ? "not-allowed"
                  : "pointer",
                fontWeight: 600,
              }}
            >
              Connect Slack
            </button>
          )}
        </section>

        {showCompose && (
          <section className="composeCard">
            <div className="cardHeader">
              <div>
                <h2>Compose Email</h2>

                <p>
                  Schedule a single email or upload
                  multiple recipients.
                </p>
              </div>

              <button
                className="closeButton"
                onClick={() =>
                  setShowCompose(false)
                }
              >
                ×
              </button>
            </div>

            <div className="form">
              <label>
                Sender

                <select
                  value={selectedSender}
                  onChange={(e) =>
                    setSelectedSender(e.target.value)
                  }
                  disabled={
                    loadingSenders ||
                    senders.length === 0
                  }
                >
                  {loadingSenders ? (
                    <option value="">
                      Loading senders...
                    </option>
                  ) : senders.length === 0 ? (
                    <option value="">
                      No senders available
                    </option>
                  ) : (
                    senders.map((sender) => (
                      <option
                        key={sender.id}
                        value={sender.id}
                      >
                        {sender.name
                          ? `${sender.name} — ${sender.email}`
                          : sender.email}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label>
                Recipient

                <input
                  type="email"
                  placeholder="recipient@example.com"
                  value={recipient}
                  onChange={(e) =>
                    setRecipient(e.target.value)
                  }
                />
              </label>

              <label>
                Subject

                <input
                  type="text"
                  placeholder="Email subject"
                  value={subject}
                  onChange={(e) =>
                    setSubject(e.target.value)
                  }
                />
              </label>

              <label>
                Message

                <textarea
                  placeholder="Write your email..."
                  value={body}
                  onChange={(e) =>
                    setBody(e.target.value)
                  }
                  rows={5}
                />
              </label>

              <div className="formRow">
                <label>
                  Start Time

                  <input
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) =>
                      setScheduledTime(e.target.value)
                    }
                  />
                </label>

                <label>
                  Delay Between Emails

                  <select
                    value={delaySeconds}
                    onChange={(e) =>
                      setDelaySeconds(e.target.value)
                    }
                  >
                    <option value="0">
                      No delay
                    </option>

                    <option value="1">
                      1 second
                    </option>

                    <option value="2">
                      2 seconds
                    </option>

                    <option value="5">
                      5 seconds
                    </option>

                    <option value="10">
                      10 seconds
                    </option>

                    <option value="30">
                      30 seconds
                    </option>

                    <option value="60">
                      1 minute
                    </option>
                  </select>
                </label>

                <label>
                  Hourly Limit

                  <input
                    type="number"
                    min="1"
                    value={hourlyLimit}
                    onChange={(e) =>
                      setHourlyLimit(e.target.value)
                    }
                  />
                </label>
              </div>

              <div className="formActions">
                <button
                  className="primaryButton"
                  onClick={scheduleEmail}
                  disabled={
                    loading ||
                    senders.length === 0
                  }
                >
                  {loading
                    ? "Scheduling..."
                    : "Schedule Email"}
                </button>
              </div>

              <div className="divider">
                <span>OR</span>
              </div>

              <label>
                Upload Recipients CSV

                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVChange}
                />
              </label>

              {csvFile && (
                <div className="csvInfo">
                  <strong>{csvFile.name}</strong>

                  <span>
                    {csvCount} email address
                    {csvCount === 1
                      ? ""
                      : "es"}{" "}
                    detected
                  </span>
                </div>
              )}

              <button
                className="secondaryButton"
                onClick={uploadCSV}
                disabled={
                  loading ||
                  !csvFile ||
                  senders.length === 0
                }
              >
                {loading
                  ? "Scheduling..."
                  : "Upload CSV & Schedule"}
              </button>

              {message && (
                <div className="message">
                  {message}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="emailCard">
          <div className="cardHeader">
            <div>
              <h2>
                {activeTab === "all"
                  ? "All Emails"
                  : activeTab.charAt(0) +
                    activeTab
                      .slice(1)
                      .toLowerCase()}
              </h2>

              <p>
                {filteredEmails.length} emails
              </p>
            </div>

            <button
              className="refreshButton"
              onClick={loadEmails}
              disabled={loadingEmails}
            >
              {loadingEmails
                ? "Loading..."
                : "↻ Refresh"}
            </button>
          </div>

          {loadingEmails ? (
            <div className="empty">
              <h3>Loading emails...</h3>
              <p>Please wait.</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="empty">
              <div className="emptyIcon">✉</div>

              <h3>No emails found</h3>

              <p>
                Schedule an email to see it here.
              </p>
            </div>
          ) : (
            <div className="tableWrapper">
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Sender</th>
                    <th>Scheduled</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredEmails.map((email) => (
                    <tr key={email.id}>
                      <td>
                        <strong>
                          {email.recipient}
                        </strong>
                      </td>

                      <td>{email.subject}</td>

                      <td>
                        {email.sender?.email ||
                          "Default"}
                      </td>

                      <td>
                        {new Date(
                          email.scheduledTime
                        ).toLocaleString()}
                      </td>

                      <td>
                        <span
                          className={`status ${email.status.toLowerCase()}`}
                        >
                          {email.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;