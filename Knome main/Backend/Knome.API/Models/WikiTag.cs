using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class WikiTag
{
    public long WikiId { get; set; }

    public string Tag { get; set; } = null!;

    public virtual Wiki Wiki { get; set; } = null!;
}
