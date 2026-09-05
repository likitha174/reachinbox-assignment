import { useEffect, useState } from "react";
import "./App.css";

type Email = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledTime: string;
  sentAt?: string | null;
  status: "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";
};

const API_URL = "http://localhost:5200";

function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [showCompose, setShowCompose] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  const [delaySeconds, setDelaySeconds] = useState("1");
  const [hourlyLimit, setHourlyLimit] = useState("100");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvCount, setCsvCount] = useState(0);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);

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

  useEffect(() => {
    loadEmails();
  }, []);

  const scheduleEmail = async () => {
    if (!recipient || !subject || !body || !scheduledTime) {
      setMessage("Please fill all required fields.");
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
        setMessage(
          "No valid email addresses detected in the CSV."
        );
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

  const uploadCSV = async () => {
    if (!csvFile || !subject || !body || !scheduledTime) {
      setMessage(
        "Select a CSV and fill subject, message and start time."
      );
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

      /*
       * Schedule each recipient separately so the selected
       * delay is applied between individual emails.
       */
      let successCount = 0;

      for (let index = 0; index < recipients.length; index++) {
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
        error instanceof Error ? error.message : "CSV upload failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredEmails =
    activeTab === "all"
      ? emails
      : emails.filter((email) => email.status === activeTab);

  const scheduledCount = emails.filter(
    (email) => email.status === "SCHEDULED"
  ).length;

  const sentCount = emails.filter(
    (email) => email.status === "SENT"
  ).length;

  const failedCount = emails.filter(
    (email) => email.status === "FAILED"
  ).length;

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
          <div className="userAvatar">L</div>

          <div>
            <strong>User</strong>
            <small>Email Scheduler</small>
          </div>
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

          <button
            className="composeButton"
            onClick={() =>
              setShowCompose(!showCompose)
            }
          >
            + Compose Email
          </button>
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
                    <option value="0">No delay</option>
                    <option value="1">1 second</option>
                    <option value="2">2 seconds</option>
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                    <option value="30">30 seconds</option>
                    <option value="60">1 minute</option>
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
                  disabled={loading}
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
                    {csvCount === 1 ? "" : "es"} detected
                  </span>
                </div>
              )}

              <button
                className="secondaryButton"
                onClick={uploadCSV}
                disabled={loading || !csvFile}
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
                    activeTab.slice(1).toLowerCase()}
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