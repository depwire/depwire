import { useState } from 'react';

function UserAvatar({ user }) {
  return (
    <img
      src={`/avatars/${user.id}.png`}
      alt={user.name}
      className="avatar"
    />
  );
}

function UserCard({ user, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="user-card">
      <UserAvatar user={user} />
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      {expanded && (
        <div className="details">
          <p>Role: {user.role}</p>
          <button onClick={() => onDelete(user.id)}>Delete</button>
        </div>
      )}
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Less' : 'More'}
      </button>
    </div>
  );
}

export default UserCard;
