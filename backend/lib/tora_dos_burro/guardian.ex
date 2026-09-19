defmodule ToraDosBurro.Guardian do
  use Guardian, otp_app: :tora_dos_burro

  alias ToraDosBurro.Accounts

  def subject_for_token(%ToraDosBurro.Accounts.User{id: id}, _claims), do: {:ok, id}
  def subject_for_token(_resource, _claims), do: {:error, :no_id_provided}

  def resource_from_claims(%{"sub" => id}) do
    case Accounts.get_user(id) do
      nil -> {:error, :resource_not_found}
      user -> {:ok, user}
    end
  end

  def resource_from_claims(_claims), do: {:error, :no_subject_in_claims}

  # Integração com guardian_db: rastreia tokens emitidos/verificados/revogados
  # no banco, permitindo revogação e rotação reais (Guardian sozinho é
  # stateless). Ver docs/security.md.

  def after_encode_and_sign(resource, claims, token, _options) do
    with {:ok, _} <- Guardian.DB.after_encode_and_sign(resource, claims["typ"], claims, token) do
      {:ok, token}
    end
  end

  def on_verify(claims, token, _options) do
    with {:ok, _} <- Guardian.DB.on_verify(claims, token) do
      {:ok, claims}
    end
  end

  def on_refresh({old_token, old_claims}, {new_token, new_claims}, _options) do
    with {:ok, _, _} <- Guardian.DB.on_refresh({old_token, old_claims}, {new_token, new_claims}) do
      {:ok, {old_token, old_claims}, {new_token, new_claims}}
    end
  end

  def on_revoke(claims, token, _options) do
    with {:ok, _} <- Guardian.DB.on_revoke(claims, token) do
      {:ok, claims}
    end
  end
end
