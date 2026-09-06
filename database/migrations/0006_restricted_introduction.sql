-- Track D3: restricted in-app introduction.
--
-- After a connection reaches 'connected', the two participants exchange
-- introductions INSIDE the app only. This table holds those short, moderated
-- text messages. It deliberately stores no name, phone number, Telegram
-- username, external link, or any contact field — those remain prohibited by
-- the application layer's contact-pattern screen. Messages are tied to a
-- connection (not directly to users) so that no thread can exist outside an
-- approved, confirmed connection.

CREATE TABLE introduction_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connection(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  body varchar(600) NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 600),
  hidden_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Sender membership of the connection and the 'connected' gate are enforced by
-- the application service (a CHECK cannot run a subquery; a trigger adds no
-- safety because the API never accepts a connection the caller is not part of).

CREATE INDEX idx_introduction_thread ON introduction_message(connection_id, hidden_by_admin, created_at);
