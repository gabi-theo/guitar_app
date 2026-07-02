import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../store/auth";

export default function Register() {
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(username, email, password);
      navigate("/");
    } catch (err: any) {
      const data = err?.response?.data;
      setError(
        data ? Object.values(data).flat().join(" ") : "Registration failed.",
      );
    }
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <h2>Create account</h2>
      {error && <p className="error">{error}</p>}
      <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="primary" type="submit">
        Register
      </button>
      <p className="muted">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </form>
  );
}
