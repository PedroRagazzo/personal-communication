defmodule ToraDosBurroWeb.CategoryJSON do
  alias ToraDosBurro.Channels.Category

  def index(%{categories: categories}), do: %{categories: Enum.map(categories, &data/1)}
  def show(%{category: category}), do: %{category: data(category)}

  def data(%Category{} = category) do
    %{id: category.id, name: category.name, position: category.position}
  end
end
